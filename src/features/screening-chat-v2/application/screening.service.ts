/**
 * Screening service for session lifecycle management and scoring finalization.
 *
 * Handles: session creation, state retrieval, result querying,
 * scoring finalization (single result, no revision), and session resume.
 */

import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';
import { getPrimaryClient, getLLMConfig } from '@/lib/llm';
import { calculateRisk } from '../domain/scoring/engine';
import { buildSummary } from '../domain/chat/checkpoint';
import { buildResultPrompt } from '../adapters/llm/prompts';
import { resultTextSchema } from '../adapters/llm/schemas';
import {
  SESSION_TTL,
  LLM_MAX_ATTEMPTS,
  LLM_RETRY_TOKEN_MULTIPLIER,
  LLM_MAX_TOKENS_CEILING,
  FINISH_REASON_TRUNCATED,
} from '../domain/config';
import { getBotText, getEdukasiPoints, type Locale } from '../domain/chat/bot-text';
import { ALL_DIMENSIONS } from '../domain/types';
import type { RiskLevel, SessionPhase, ScoringState } from '../domain/types';

// --- Public Interfaces ---

export interface StartInput {
  locale?: 'id' | 'en';
  mode?: string;
}

export interface StartResponse {
  sessionId: string;
  phase: SessionPhase;
  greeting: string;
}

export interface ResultResponse {
  riskLevel: RiskLevel;
  gejalaCount: number;
  faktorCount: number;
  scoringState: Record<string, boolean>;
  perception: string;
  partial: boolean;
  edukasi: string[];
  aiConclusion: string | null;
  aiPerceptionResponse: string | null;
  aiRecommendation: string | null;
  aiSuggestion: string | null;
}

export interface ResumeResponse {
  sessionId: string;
  phase: SessionPhase;
  turnCount: number;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
}

export interface SessionStateResponse {
  sessionId: string;
  phase: SessionPhase;
  status: string;
  turnCount: number;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  hasilDitampilkan: boolean;
  partial: boolean;
  expiresAt: Date | null;
}

// --- Service Functions ---

/**
 * Create a new screening session with defaults.
 *
 * Sets expiresAt = now + SESSION_TTL (24h).
 * All v2 fields initialized to defaults via Prisma schema.
 */
export async function createSession(input: StartInput): Promise<StartResponse> {
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000);

  const session = await prisma.screeningSession.create({
    data: {
      locale: input.locale ?? 'id',
      mode: input.mode ?? 'ai',
      phase: 'GREETING',
      dimensiBelum: [...ALL_DIMENSIONS],
      expiresAt,
    },
    select: {
      id: true,
      phase: true,
    },
  });

  // Generate initial greeting message from system, in the session's language
  const greetingText = getBotText(input.locale ?? 'id').greeting;
  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      content: greetingText,
      isVoice: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      sessionId: session.id,
      event: 'session_created',
      detail: { locale: input.locale ?? 'id', mode: input.mode ?? 'ai' },
    },
  });

  return {
    sessionId: session.id,
    phase: session.phase as SessionPhase,
    greeting: greetingText,
  };
}

/**
 * Get current session state by ID.
 *
 * Returns null if session not found.
 */
export async function getSessionState(sessionId: string): Promise<SessionStateResponse | null> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      phase: true,
      status: true,
      turnCount: true,
      dimensiTerisi: true,
      dimensiBelum: true,
      hasilDitampilkan: true,
      partial: true,
      expiresAt: true,
    },
  });

  if (!session) return null;

  return {
    sessionId: session.id,
    phase: session.phase as SessionPhase,
    status: session.status,
    turnCount: session.turnCount,
    dimensiTerisi: session.dimensiTerisi as Record<
      string,
      { keywords: string[]; negasi: string[] }
    >,
    dimensiBelum: session.dimensiBelum,
    hasilDitampilkan: session.hasilDitampilkan,
    partial: session.partial,
    expiresAt: session.expiresAt,
  };
}

/**
 * Get the ScreeningResult for a session.
 *
 * Uses findUnique since sessionId is @unique on ScreeningResult.
 * Returns null if no result exists yet.
 */
export async function getResult(sessionId: string): Promise<ResultResponse | null> {
  const result = await prisma.screeningResult.findUnique({
    where: { sessionId },
  });

  if (!result) return null;

  // Locale comes from the session: the result row does not carry one, but the
  // edukasi points are user-facing and must match the language of the chat.
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: { locale: true },
  });
  const locale: Locale = session?.locale === 'en' ? 'en' : 'id';

  // Determine edukasi points based on risk level
  const riskLevel = result.riskLevel as RiskLevel;
  const edukasi = getEdukasiByRisk(riskLevel, locale);

  return {
    riskLevel,
    gejalaCount: result.gejalaCount,
    faktorCount: result.faktorCount,
    scoringState: result.scoringState as Record<string, boolean>,
    perception: result.perception,
    partial: result.partial,
    edukasi,
    // AI-generated text (null = belum ready / not yet implemented)
    aiConclusion: ((result as Record<string, unknown>).aiConclusion as string | null) ?? null,
    aiPerceptionResponse:
      ((result as Record<string, unknown>).aiPerceptionResponse as string | null) ?? null,
    aiRecommendation:
      ((result as Record<string, unknown>).aiRecommendation as string | null) ?? null,
    aiSuggestion: ((result as Record<string, unknown>).aiSuggestion as string | null) ?? null,
  };
}

/** Get edukasi points based on risk level, in the session's language. */
function getEdukasiByRisk(riskLevel: RiskLevel, locale: Locale): string[] {
  return getEdukasiPoints(riskLevel, locale);
}

/**
 * Finalize scoring for a session.
 *
 * 1. Load session with scoring boolean fields
 * 2. Build ScoringState from session booleans
 * 3. calculateRisk(scoringState) for final risk level
 * 4. Upsert single ScreeningResult (sessionId is @unique)
 * 5. Build checkpoint: buildSummary(scoring, coverage, perception, emosi)
 * 6. Upsert Checkpoint
 * 7. AuditLog('finalize')
 * 8. (Async, non-blocking) Generate contextNote via LLM — don't await
 * 9. Return ResultResponse
 */
export async function finalize(sessionId: string): Promise<ResultResponse> {
  // 1. Load session with scoring booleans
  const session = await prisma.screeningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      locale: true,
      dimensiTerisi: true,
      dimensiBelum: true,
      perception: true,
      partial: true,
      metadata: true,
      gatalMalam: true,
      kontakSerupa: true,
      lokasiKhas: true,
      asrama: true,
      tukarAlat: true,
    },
  });

  const dimensiTerisi = session.dimensiTerisi as Record<
    string,
    { keywords: string[]; negasi: string[] }
  >;
  const dimensiBelum = session.dimensiBelum;

  // 2. Build ScoringState from session booleans
  const scoringState: ScoringState = {
    gatalMalam: session.gatalMalam,
    kontakSerupa: session.kontakSerupa,
    lokasiKhas: session.lokasiKhas,
    asrama: session.asrama,
    tukarAlat: session.tukarAlat,
  };

  // 3. Calculate risk
  const scoringResult = calculateRisk(scoringState);

  const perception = session.perception ?? 'adequate';

  // 4. Upsert single ScreeningResult (sessionId is @unique — no revision)
  await prisma.screeningResult.upsert({
    where: { sessionId },
    create: {
      sessionId,
      riskLevel: scoringResult.riskLevel,
      gejalaCount: scoringResult.gejalaCount,
      faktorCount: scoringResult.faktorCount,
      scoringState: scoringResult.state as unknown as Prisma.InputJsonValue,
      perception: perception.toUpperCase() as Prisma.ScreeningResultCreateInput['perception'],
      partial: session.partial,
    },
    update: {
      riskLevel: scoringResult.riskLevel,
      gejalaCount: scoringResult.gejalaCount,
      faktorCount: scoringResult.faktorCount,
      scoringState: scoringResult.state as unknown as Prisma.InputJsonValue,
      perception: perception.toUpperCase() as Prisma.ScreeningResultCreateInput['perception'],
      partial: session.partial,
    },
  });

  // 5. Build checkpoint summary
  const coverageState = { dimensiTerisi, dimensiBelum };
  const emosi =
    ((session.metadata as Record<string, unknown> | null)?.emosi as string | null) ?? null;
  const summaryInput = {
    total: 0,
    riskLevel: scoringResult.riskLevel,
    perDimension: {} as Record<string, number>,
    penalty: 0,
  };
  const summary = buildSummary(summaryInput, coverageState, perception, emosi);

  // 6. Upsert Checkpoint (no resultRevision — simplified)
  await prisma.checkpoint.upsert({
    where: { sessionId },
    create: {
      sessionId,
      summary: summary as unknown as Prisma.InputJsonValue,
      resultRevision: 1,
    },
    update: {
      summary: summary as unknown as Prisma.InputJsonValue,
    },
  });

  // Update session: mark hasilDitampilkan and phase
  await prisma.screeningSession.update({
    where: { id: sessionId },
    data: {
      hasilDitampilkan: true,
      phase: 'SCREENING_COMPLETE',
      status: 'COMPLETED',
    },
  });

  // 7. AuditLog
  await prisma.auditLog.create({
    data: {
      sessionId,
      event: 'finalize',
      detail: {
        gejalaCount: scoringResult.gejalaCount,
        faktorCount: scoringResult.faktorCount,
        riskLevel: scoringResult.riskLevel,
      },
    },
  });

  // 8. Async contextNote generation (non-blocking) — fire-and-forget
  generateContextNote(sessionId, summary).catch(() => {
    // Silently swallow — requirement 9.2: failure SHALL NOT block
  });

  // Fire-and-forget: generate AI result text (non-blocking)
  generateResultText(sessionId).catch(() => {});

  // 9. Return result
  const riskLevel = scoringResult.riskLevel;
  return {
    riskLevel,
    gejalaCount: scoringResult.gejalaCount,
    faktorCount: scoringResult.faktorCount,
    scoringState: scoringResult.state as unknown as Record<string, boolean>,
    perception,
    partial: session.partial,
    edukasi: getEdukasiByRisk(riskLevel, session.locale === 'en' ? 'en' : 'id'),
    aiConclusion: null,
    aiPerceptionResponse: null,
    aiRecommendation: null,
    aiSuggestion: null,
  };
}

/**
 * Resume an existing session if valid.
 *
 * Checks: session exists + status=IN_PROGRESS + expiresAt > now.
 * Returns null if expired or completed.
 */
export async function resumeSession(sessionId: string): Promise<ResumeResponse | null> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      phase: true,
      turnCount: true,
      dimensiTerisi: true,
      dimensiBelum: true,
      expiresAt: true,
    },
  });

  if (!session) return null;

  // Check status is still IN_PROGRESS
  if (session.status !== 'IN_PROGRESS') return null;

  // Check TTL: expiresAt must be in the future
  if (session.expiresAt && session.expiresAt < new Date()) return null;

  // Load chat messages for UI hydration
  const chatMessages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  });

  const messages = chatMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.createdAt.toISOString(),
  }));

  return {
    sessionId: session.id,
    phase: session.phase as SessionPhase,
    turnCount: session.turnCount,
    dimensiTerisi: session.dimensiTerisi as Record<
      string,
      { keywords: string[]; negasi: string[] }
    >,
    dimensiBelum: session.dimensiBelum,
    messages,
  };
}

// --- Public: Result Text Generation ---

/**
 * Generate AI result text via LLM (fire-and-forget).
 *
 * Loads session data, builds prompt, calls LLM, validates response with Zod,
 * and updates ScreeningResult with 4 AI fields.
 *
 * Retry: 1x on LLM error or Zod validation failure.
 * On second failure: logs to AuditLog, does NOT throw.
 *
 * Requirements: FR-3
 */
export async function generateResultText(sessionId: string): Promise<void> {
  // Idempotency guard: analysis runs exactly once per session; all other reads
  // are DB-only (via getResult()). If aiConclusion is already set, the LLM
  // analysis has already completed — return immediately without re-running it.
  const existing = await prisma.screeningResult.findUnique({
    where: { sessionId },
    select: { aiConclusion: true },
  });
  if (existing?.aiConclusion != null) {
    return;
  }

  // 1. Load session to get locale, scoring booleans, dimensiTerisi, perception
  const session = await prisma.screeningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      locale: true,
      dimensiTerisi: true,
      perception: true,
      gatalMalam: true,
      kontakSerupa: true,
      lokasiKhas: true,
      asrama: true,
      tukarAlat: true,
    },
  });

  const locale = (session.locale ?? 'id') as 'id' | 'en';
  const dimensiTerisi = session.dimensiTerisi as Record<
    string,
    { keywords: string[]; negasi: string[] }
  >;
  const perception = session.perception ?? 'ADEQUATE';

  // 2. Build ScoringState and calculate risk
  const scoringState: ScoringState = {
    gatalMalam: session.gatalMalam,
    kontakSerupa: session.kontakSerupa,
    lokasiKhas: session.lokasiKhas,
    asrama: session.asrama,
    tukarAlat: session.tukarAlat,
  };
  const scoringResult = calculateRisk(scoringState);
  const riskLevel = scoringResult.riskLevel;

  // 3. Build prompt
  const messages = buildResultPrompt(scoringState, dimensiTerisi, perception, riskLevel, locale);

  // 4. Call LLM with retry logic (1 retry on failure)
  const client = getPrimaryClient();
  const config = getLLMConfig();

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt++) {
    try {
      // The output cap is shared with reasoning tokens on a thinking model, and
      // a truncated response here is unparseable JSON — which silently leaves
      // all four AI fields null and drops the result page onto its static
      // fallbacks. Retry with a wider budget before giving up.
      const maxTokens =
        attempt === 0
          ? config.maxTokensOutput
          : Math.min(config.maxTokensOutput * LLM_RETRY_TOKEN_MULTIPLIER, LLM_MAX_TOKENS_CEILING);

      const response = await client.chat.completions.create({
        model: config.model,
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages,
        ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
      });

      const choice = response.choices[0];
      if (choice?.finish_reason === FINISH_REASON_TRUNCATED) {
        console.warn('[result-text] truncated response discarded', { attempt, maxTokens });
        if (attempt === LLM_MAX_ATTEMPTS - 1) break;
        continue;
      }

      const content = choice?.message?.content;
      const parsed = JSON.parse(content ?? '');
      const validated = resultTextSchema.parse(parsed);

      // Success: update ScreeningResult with 4 AI fields
      await prisma.screeningResult.update({
        where: { sessionId },
        data: {
          aiConclusion: validated.conclusion,
          aiPerceptionResponse: validated.perceptionResponse,
          aiRecommendation: validated.recommendation,
          aiSuggestion: validated.suggestion,
        },
      });

      return;
    } catch {
      // If first attempt failed, retry once; if second attempt, fall through to log
      if (attempt === LLM_MAX_ATTEMPTS - 1) break;
      // First failure: continue to retry
    }
  }

  // Every attempt failed — log and leave the AI fields null so the result page
  // renders its localized static fallbacks.
  await prisma.auditLog.create({
    data: {
      sessionId,
      event: 'result_text_generation_failed',
      detail: { error: 'LLM call or validation failed after 1 retry' },
    },
  });
}

// --- Internal Helpers ---

/**
 * Generate a contextNote via LLM (async, non-blocking).
 *
 * Called fire-and-forget after finalize. Failure is silently handled.
 * Generates ~50 tokens of clinical context for follow-up phase.
 */
async function generateContextNote(
  sessionId: string,
  summary: ReturnType<typeof buildSummary>,
): Promise<void> {
  try {
    const client = getPrimaryClient();
    const config = getLLMConfig();

    const response = await client.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content:
            'Kamu adalah asisten klinis. Buat ringkasan singkat (1-2 kalimat) dari hasil skrining berikut untuk konteks follow-up. Fokus pada temuan klinis utama.',
        },
        {
          role: 'user',
          content: JSON.stringify(summary),
        },
      ],
    });

    const contextNote = response.choices[0]?.message?.content?.trim() ?? null;

    if (contextNote) {
      await prisma.checkpoint.update({
        where: { sessionId },
        data: { contextNote },
      });
    }
  } catch {
    // Non-blocking — per requirement 9.2
    // Error is already caught by the caller's .catch()
  }
}
