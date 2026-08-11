import { prisma } from '@/db/prisma';
import { type Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { CONFIG } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { createLLMClient } from '@/lib/llm';
import { parseLLMResponse, extractReplyFromPartial } from '@/features/screening-chat-v1/internal';
import {
  resolveProviderConfig,
  getProviderEnvVar,
  type PlaygroundEnv,
} from '@/lib/llm/playground-client';
import { appendToPool, calculateAllScores } from '@/features/screening-chat-v1/internal';
import type {
  KeywordPool,
  CategoryExtraction,
  ExtractedKeyword,
  ScoringResult,
} from '@/features/screening-chat-v1/internal';

export interface PlaygroundConfig {
  provider: 'groq' | 'huggingface' | 'gemini' | 'ollama';
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface PlaygroundOptions {
  enableScoring: boolean;
  locale: 'id' | 'en';
  sessionId?: string;
  mode: 'single-shot' | 'multi-turn' | 'compare';
  customSystemPrompt?: boolean;
}

export interface PlaygroundResponse {
  reply: string;
  extraction: Record<string, ExtractedKeyword[]> | null;
  scoring: ScoringResult | null;
  metadata: {
    latencyMs: number;
    model: string;
    tokensUsed: { input: number; output: number } | null;
    provider: string;
  };
  sessionId: string;
  turnNumber: number;
}

/**
 * Process a single playground chat request. Orchestrates:
 * 1. Resolve provider config (baseUrl + apiKey)
 * 2. Get or create session
 * 3. Call LLM (non-streaming, 30s timeout)
 * 4. Parse response
 * 5. Optionally score extraction
 * 6. Persist TurnLog with metadata (non-blocking)
 * 7. Return PlaygroundResponse
 */
export async function processPlaygroundChat(
  config: PlaygroundConfig,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options: PlaygroundOptions,
): Promise<PlaygroundResponse> {
  // 1. Resolve provider config — env read happens here (service layer, allowed)
  const env = getEnv();
  const playgroundEnv: PlaygroundEnv = {
    PLAYGROUND_GROQ_KEY: env.PLAYGROUND_GROQ_KEY,
    PLAYGROUND_HF_KEY: env.PLAYGROUND_HF_KEY,
    PLAYGROUND_GEMINI_KEY: env.PLAYGROUND_GEMINI_KEY,
    PLAYGROUND_OLLAMA_URL: env.PLAYGROUND_OLLAMA_URL,
  };

  const providerConfig = resolveProviderConfig(config.provider, playgroundEnv);
  if (!providerConfig) {
    const envVar = getProviderEnvVar(config.provider);
    throw new AppError(
      `Provider ${config.provider} not configured. Add ${envVar} to .env`,
      400,
      'PROVIDER_NOT_CONFIGURED',
    );
  }

  // 2. Session management (supports scratch session reuse for single-shot)
  const { sessionId, turnNumber } = await resolveSession(options);

  // 3. Create per-request LLM client and call
  const client = createLLMClient(providerConfig.baseUrl, providerConfig.apiKey);
  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: config.systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const startTime = Date.now();
  let rawContent: string;
  let tokensUsed: { input: number; output: number } | null = null;

  try {
    const response = await client.chat.completions.create(
      {
        model: config.model,
        messages: llmMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        response_format: { type: 'json_object' },
      },
      { timeout: CONFIG.playground.TIMEOUT_MS },
    );

    rawContent = response.choices[0]?.message?.content ?? '';

    if (response.usage) {
      tokensUsed = {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
      };
    }
  } catch (error) {
    // Error classification lives in service (not route)
    if (isTimeoutError(error)) {
      throw new AppError('Provider did not respond within 30s', 504, 'LLM_TIMEOUT');
    }
    const status = extractHttpStatus(error);
    throw new AppError(`Provider returned error: ${status ?? 'unknown'}`, 502, 'LLM_ERROR');
  }

  const latencyMs = Date.now() - startTime;

  // 4. Parse LLM response
  const parseResult = parseLLMResponse(rawContent);
  let reply: string;
  let extraction: CategoryExtraction | null = null;
  let parseStatus: 'SUCCESS' | 'PARTIAL' | 'FAILURE';

  if (parseResult.status === 'success') {
    reply = parseResult.data.reply;
    extraction = parseResult.data.extraction;
    parseStatus = 'SUCCESS';
  } else if (parseResult.status === 'partial') {
    reply = parseResult.reply;
    parseStatus = 'PARTIAL';
  } else {
    const extracted = extractReplyFromPartial(rawContent);
    reply = extracted ?? rawContent;
    parseStatus = 'FAILURE';
  }

  // 5. Optional scoring
  const scoring = computePlaygroundScoring(extraction, options.enableScoring, options.locale);

  // 6. Persist TurnLog (non-blocking)
  const userMessage = messages[messages.length - 1]?.content ?? '';
  persistTurnLog({
    sessionId,
    turnNumber,
    userMessage,
    rawResponse: rawContent,
    parseStatus,
    systemMessage: config.systemPrompt,
    model: config.model,
    latencyMs,
    tokensUsed,
    config,
    mode: options.mode,
    customSystemPrompt: options.customSystemPrompt ?? true,
  });

  // 7. Return response
  return {
    reply,
    extraction: extraction as Record<string, ExtractedKeyword[]> | null,
    scoring,
    metadata: { latencyMs, model: config.model, tokensUsed, provider: config.provider },
    sessionId,
    turnNumber,
  };
}

// ==================== Scoring ====================

/**
 * Compute scoring for playground extraction.
 * Exported for testability.
 */
export function computePlaygroundScoring(
  extraction: CategoryExtraction | null,
  enableScoring: boolean,
  locale: 'id' | 'en',
): ScoringResult | null {
  if (!enableScoring || !extraction) {
    return null;
  }

  const emptyPool: KeywordPool = {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };
  const pool = appendToPool(emptyPool, extraction, 1);
  return calculateAllScores(pool, locale);
}

// ==================== Session Management ====================

/**
 * Resolve or create session.
 * - multi-turn + sessionId: reuse existing session
 * - single-shot/compare + sessionId: reuse scratch session (no turn limit)
 * - no sessionId: create new session
 */
async function resolveSession(options: PlaygroundOptions): Promise<{
  sessionId: string;
  turnNumber: number;
}> {
  if (options.sessionId) {
    if (options.mode === 'multi-turn') {
      return reuseMultiTurnSession(options.sessionId);
    }
    return reuseScratchSession(options.sessionId);
  }
  return createPlaygroundSession(options.locale);
}

async function createPlaygroundSession(locale: 'id' | 'en'): Promise<{
  sessionId: string;
  turnNumber: number;
}> {
  const session = await prisma.screeningSession.create({
    data: {
      source: 'playground',
      locale,
      mode: 'ai',
      status: 'IN_PROGRESS',
      promptVersion: 'playground',
      scoringVersion: 'v1',
    },
  });
  return { sessionId: session.id, turnNumber: 1 };
}

async function reuseMultiTurnSession(sessionId: string): Promise<{
  sessionId: string;
  turnNumber: number;
}> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { turnLogs: { select: { turnNumber: true } } },
  });

  if (!session || session.source !== 'playground') {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  const existingTurns = session.turnLogs.length;
  if (existingTurns >= CONFIG.sessionLimits.MAX_TURNS) {
    throw new AppError('Maximum 7 turns reached', 400, 'SESSION_COMPLETE');
  }

  return { sessionId: session.id, turnNumber: existingTurns + 1 };
}

/**
 * Reuse a scratch session for single-shot/compare mode.
 * No turn limit — just increments turn number.
 */
async function reuseScratchSession(sessionId: string): Promise<{
  sessionId: string;
  turnNumber: number;
}> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { turnLogs: { select: { turnNumber: true } } },
  });

  if (!session || session.source !== 'playground') {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  const existingTurns = session.turnLogs.length;
  return { sessionId: session.id, turnNumber: existingTurns + 1 };
}

// ==================== TurnLog Persistence ====================

export interface PlaygroundTurnLogMetadata {
  source: 'playground';
  provider: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  customSystemPrompt: boolean;
  mode: 'single-shot' | 'multi-turn' | 'compare';
}

export interface PersistTurnLogParams {
  sessionId: string;
  turnNumber: number;
  userMessage: string;
  rawResponse: string;
  parseStatus: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
  systemMessage: string;
  model: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number } | null;
  config: PlaygroundConfig;
  mode: 'single-shot' | 'multi-turn' | 'compare';
  customSystemPrompt: boolean;
}

/**
 * Persist TurnLog with playground metadata. Non-blocking.
 */
export function persistTurnLog(params: PersistTurnLogParams): void {
  const metadata: PlaygroundTurnLogMetadata = {
    source: 'playground',
    provider: params.config.provider,
    temperature: params.config.temperature,
    topP: params.config.topP,
    maxTokens: params.config.maxTokens,
    customSystemPrompt: params.customSystemPrompt,
    mode: params.mode,
  };

  prisma.turnLog
    .create({
      data: {
        sessionId: params.sessionId,
        turnNumber: params.turnNumber,
        userMessage: params.userMessage,
        rawResponse: params.rawResponse,
        parseStatus: params.parseStatus,
        parseError: params.parseStatus !== 'SUCCESS' ? 'Parse incomplete' : null,
        systemMessage: params.systemMessage,
        model: params.model,
        promptVersion: 'playground',
        latencyMs: params.latencyMs,
        tokenUsage: params.tokensUsed
          ? { input: params.tokensUsed.input, output: params.tokensUsed.output }
          : undefined,
        retryCount: 0,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    })
    .catch((error) => {
      console.error('[Playground] TurnLog persistence failed', {
        sessionId: params.sessionId,
        turnNumber: params.turnNumber,
        error,
      });
    });
}

// ==================== Error Helpers ====================

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === 'APIConnectionTimeoutError' ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('etimedout')
    );
  }
  return false;
}

function extractHttpStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status;
  }
  return null;
}
