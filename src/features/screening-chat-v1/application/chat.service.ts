import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';
import { sanitizeUserInput } from '@/lib/sanitize';
import { getPrimaryClient, getFallbackClient, getLLMConfig, getFallbackModel } from '@/lib/llm';
import {
  parseLLMResponse,
  parseOutputResponse,
  extractReplyFromPartial,
} from '../adapters/llm/parser';
import { buildMessages, buildOutputMessages, PROMPT_VERSION } from '../adapters/llm/prompts';
import type {
  SessionContext as LLMSessionContext,
  OutputContext as LLMOutputContext,
} from '../adapters/llm/prompts';
import {
  encodeSSE,
  createReplyDetector,
  type SSEEvent,
  type DonePayload,
} from '../adapters/llm/stream-helpers';
import { appendToPool } from '../domain/scoring/pool';
import { calculateAllScores } from '../domain/scoring/engine';
import type { KeywordPool, CategoryExtraction, CategoryName } from '../domain/keywords/types';
import { CONFIG } from '@/lib/config';
import { getRiskLevel, type SupportedLocale } from '../domain/config';
import {
  NotFoundError,
  ValidationError,
  SessionNotFoundError,
  SessionCompletedError,
} from '@/lib/errors';
import { parseCategoriesCovered, parseScores } from '@/lib/prisma-json';
import { getPills, getPillById } from '../adapters/questionnaire/pills';

import { checkCrisis } from '../domain/chat/crisis';
import { getNextInstruction, buildCategoryTracker } from '../domain/chat/instruction';
import { detectEdgeCase } from '../domain/chat/edge-cases';
import { getFallbackTemplate, buildOutputContext } from '../domain/chat/output';
import { determineCoveredCategories } from '../domain/chat/coverage';
import { transition } from '../domain/chat/state-machine';
import { selectTheme } from '../domain/chat/persona';
import type { SessionContext, EducationLevelInput, Instruction } from '../domain/types';

// ─── Constants ───

const CATEGORY_ORDER: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

// ─── Session Metadata Interface ───

interface SessionMetadata {
  followedUp: CategoryName[];
  followUpTarget: CategoryName | null;
  offTopicCount: number;
  shortAnswerCount: number;
  isForceClose: boolean;
}

const DEFAULT_METADATA: SessionMetadata = {
  followedUp: [],
  followUpTarget: null,
  offTopicCount: 0,
  shortAnswerCount: 0,
  isForceClose: false,
};

// ─── Helpers ───

function createEmptyPool(): KeywordPool {
  return {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };
}

function parseMetadata(raw: unknown): SessionMetadata {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_METADATA };
  const obj = raw as Record<string, unknown>;
  return {
    followedUp: Array.isArray(obj.followedUp) ? (obj.followedUp as CategoryName[]) : [],
    followUpTarget: (obj.followUpTarget as CategoryName | null) ?? null,
    offTopicCount: typeof obj.offTopicCount === 'number' ? obj.offTopicCount : 0,
    shortAnswerCount: typeof obj.shortAnswerCount === 'number' ? obj.shortAnswerCount : 0,
    isForceClose: typeof obj.isForceClose === 'boolean' ? obj.isForceClose : false,
  };
}

/** Derive session state from DB fields */
function deriveSessionState(
  status: string,
  categoriesCovered: string[],
  metadata: SessionMetadata,
): 'PRE_CHAT' | 'CHATTING' | 'FOLLOW_UP' | 'COMPLETED' | 'TERMINATED' {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'REVIEWED') return 'COMPLETED';
  if (metadata.followUpTarget) return 'FOLLOW_UP';
  if (categoriesCovered.length === 0 && !metadata.followUpTarget) return 'CHATTING';
  return 'CHATTING';
}

/** Normalize Prisma EducationLevel (SCREAMING_CASE) to lowercase for Chat Engine */
function normalizeEducationLevel(
  level: string | undefined | null,
): EducationLevelInput | undefined {
  if (!level) return undefined;
  return level.toLowerCase() as EducationLevelInput;
}

// ─── Main Public API ───

/**
 * Process a single chat turn using the new Chat Engine architecture.
 * Orchestrates: crisis check → edge case → instruction → LLM → parse → score → persist.
 *
 * Returns a ReadableStream of SSE events for real-time client streaming.
 */
export function processChatTurn(
  sessionId: string,
  message: string,
  isVoice: boolean,
): Promise<ReadableStream<Uint8Array>> {
  return buildChatStream(sessionId, message, isVoice);
}

async function buildChatStream(
  sessionId: string,
  message: string,
  isVoice: boolean,
): Promise<ReadableStream<Uint8Array>> {
  // 1. Load session + demographics + messages + extractions
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      demographics: true,
      messages: { orderBy: { createdAt: 'asc' } },
      extractions: { orderBy: { turnNumber: 'asc' } },
    },
  });

  if (!session) {
    throw new NotFoundError(`Session not found: ${sessionId}`);
  }

  // 2. Validate session state
  if (session.status !== 'IN_PROGRESS') {
    throw new ValidationError(`Session is not in progress (status: ${session.status})`);
  }

  if (session.mode !== 'ai') {
    throw new ValidationError(`Session is in questionnaire mode — LLM calls not allowed`);
  }

  // 3. Parse metadata and reconstruct context
  const categoriesCovered = parseCategoriesCovered(session.categoriesCovered);
  const messageCount = session.messages.length;
  const currentTurn = Math.floor(messageCount / 2) + 1;
  const metadata = parseMetadata(session.metadata);
  const locale = session.locale as SupportedLocale;
  const educationLevel = normalizeEducationLevel(session.demographics?.educationLevel);
  const theme = selectTheme(educationLevel);

  // 4. Check max turn limit (14 messages = 7 user turns) → trigger output generation (Req 9.6)
  if (messageCount >= CONFIG.sessionLimits.MAX_MESSAGES) {
    return generateSessionOutput(sessionId, {
      isForceClose: true,
      preloadedSession: session as unknown as LoadedSession,
    });
  }

  // 5. Reconstruct SessionContext from DB state
  const sessionContext: SessionContext = {
    sessionId,
    state: deriveSessionState(session.status, categoriesCovered, metadata),
    theme,
    locale,
    turn: currentTurn,
    categoriesCovered: categoriesCovered as CategoryName[],
    categoriesFollowedUp: metadata.followedUp,
    followUpTarget: metadata.followUpTarget,
    offTopicCount: metadata.offTopicCount,
    shortAnswerCount: metadata.shortAnswerCount,
  };

  // 6. Sanitize user input
  const sanitizedMessage = sanitizeUserInput(message);

  // 7. Crisis check — rule-based, runs BEFORE LLM call
  const crisisResult = checkCrisis(sanitizedMessage, locale);

  if (crisisResult) {
    return handleCrisis(sessionId, sanitizedMessage, isVoice, sessionContext, crisisResult);
  }

  // 8. Build category tracker for instruction logic
  const categoryTracker = buildCategoryTracker(
    categoriesCovered as CategoryName[],
    metadata.followedUp,
  );

  // 9. Get last extraction for instruction determination
  const lastExtractionRecord =
    session.extractions.length > 0 ? session.extractions[session.extractions.length - 1] : null;
  const lastExtraction = lastExtractionRecord
    ? (lastExtractionRecord.extraction as unknown as CategoryExtraction)
    : null;

  // 10. Pre-LLM edge case detection (using last extraction for context)
  const edgeCase = detectEdgeCase(sanitizedMessage, lastExtraction, sessionContext);

  // 11. Determine instruction — uses edge case instruction if available, otherwise normal flow
  let instruction: Instruction;
  if (edgeCase.type !== 'normal' && edgeCase.instruction) {
    instruction = edgeCase.instruction;
  } else {
    instruction = getNextInstruction(sessionContext, categoryTracker, lastExtraction);
  }

  // 12. Build LLM session context (for existing prompt builder)
  const categoriesRemaining = CATEGORY_ORDER.filter((c) => !categoriesCovered.includes(c));
  const demographics = session.demographics;

  const llmContext: LLMSessionContext = {
    theme,
    locale,
    turn: currentTurn,
    demographics: {
      age: demographics?.age ?? 18,
      gender: demographics?.gender ?? 'unknown',
    },
    categoriesCovered,
    categoriesRemaining,
    instruction: {
      type: instruction.type,
      targetCategory: instruction.targetCategory,
      isFollowUp: instruction.isFollowUp,
    },
  };

  // 13. Build conversation history
  const history: Array<{ role: 'assistant' | 'user'; content: string }> = session.messages.map(
    (msg) => ({
      role: msg.role as 'assistant' | 'user',
      content: msg.content,
    }),
  );

  // 14. Build prompt messages
  const messages = buildMessages(llmContext, history, sanitizedMessage);

  // 15. Execute streaming LLM call
  const config = getLLMConfig();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let finalReply: string | null = null;
      let finalExtraction: CategoryExtraction | null = null;
      let firstTokenEmitted = false;
      let streamInterrupted = false;
      let partialBuffer = '';
      let usedModel = config.model;
      let retryCount = 0;
      let totalLatencyMs = 0;
      let _totalTtfbMs = 0;
      let rawResponseBuffer = '';
      let parseErrorMsg: string | null = null;
      let tokensUsed: { input: number; output: number } | null = null;

      const systemMessageContent = (messages[0]?.content as string) || '';

      // Attempt loop: max 2 attempts, but only if no tokens were emitted
      for (let attempt = 1; attempt <= 2; attempt++) {
        const startTime = Date.now();
        let ttfbMs = 0;
        let accumulatedBuffer = '';

        const fallbackClient = getFallbackClient();
        const fallbackModel = getFallbackModel();
        const isPrimaryAttempt = attempt === 1;
        const client = isPrimaryAttempt
          ? getPrimaryClient()
          : (fallbackClient ?? getPrimaryClient());
        const model = isPrimaryAttempt ? config.model : (fallbackModel ?? config.model);
        const timeout = isPrimaryAttempt ? config.timeoutMs : config.retryTimeoutMs;

        usedModel = model;
        if (attempt > 1) retryCount = attempt - 1;

        try {
          const stream = await client.chat.completions.create(
            {
              model,
              messages,
              temperature: config.temperatureChat,
              max_tokens: config.maxTokensChat,
              top_p: config.topP,
              stream: true,
              response_format: { type: 'json_object' },
            },
            { timeout },
          );

          const detector = createReplyDetector();
          let lastChunk: unknown = null;

          for await (const chunk of stream) {
            lastChunk = chunk;
            const delta = chunk.choices[0]?.delta?.content;
            if (!delta) continue;

            if (!firstTokenEmitted) {
              ttfbMs = Date.now() - startTime;
            }

            accumulatedBuffer += delta;

            const { forwardable } = detector.feed(delta);
            if (forwardable) {
              firstTokenEmitted = true;
              const tokenEvent: SSEEvent = { event: 'token', data: { content: forwardable } };
              controller.enqueue(encoder.encode(encodeSSE(tokenEvent)));
            }
          }

          totalLatencyMs = Date.now() - startTime;
          _totalTtfbMs = ttfbMs;
          rawResponseBuffer = accumulatedBuffer;

          // Collect token usage
          if (lastChunk && typeof lastChunk === 'object' && 'usage' in lastChunk) {
            const usage = (lastChunk as Record<string, unknown>).usage as
              | { prompt_tokens?: number; completion_tokens?: number }
              | undefined;
            if (usage?.prompt_tokens != null && usage?.completion_tokens != null) {
              tokensUsed = { input: usage.prompt_tokens, output: usage.completion_tokens };
            }
          }

          // Parse the accumulated response
          const parseResult = parseLLMResponse(accumulatedBuffer);

          if (parseResult.status === 'success') {
            finalReply = parseResult.data.reply;
            finalExtraction = parseResult.data.extraction;
            break;
          }

          if (parseResult.status === 'partial') {
            finalReply = parseResult.reply;
            parseErrorMsg = 'Schema validation failed — reply recovered but extraction missing';

            if (firstTokenEmitted) break;
            continue;
          }

          // Parse failure
          parseErrorMsg = 'JSON parse error or schema invalid';

          if (firstTokenEmitted) {
            const extracted = extractReplyFromPartial(accumulatedBuffer);
            if (extracted) finalReply = extracted;
            break;
          }

          if (attempt === 2) {
            const extracted = extractReplyFromPartial(accumulatedBuffer);
            if (extracted) finalReply = extracted;
          }
        } catch (error) {
          totalLatencyMs = Date.now() - startTime;
          _totalTtfbMs = ttfbMs;
          rawResponseBuffer = accumulatedBuffer;
          parseErrorMsg = error instanceof Error ? error.message : 'LLM call failed';

          if (firstTokenEmitted) {
            streamInterrupted = true;
            partialBuffer = accumulatedBuffer;

            const errorEvent: SSEEvent = {
              event: 'error',
              data: {
                code: 'STREAM_INTERRUPTED',
                message: 'Stream interrupted after partial response',
                retryable: false,
              },
            };
            controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
            break;
          }

          if (attempt === 2) {
            finalReply = null;
          }
        }
      }

      // Determine parseStatus for TurnLog
      let parseStatus: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
      if (finalExtraction && finalReply) {
        parseStatus = 'SUCCESS';
      } else if (finalReply && !finalExtraction) {
        parseStatus = 'PARTIAL';
      } else if (streamInterrupted) {
        parseStatus = 'PARTIAL';
      } else {
        parseStatus = 'FAILURE';
      }

      // Persist TurnLog
      try {
        await prisma.turnLog.create({
          data: {
            sessionId,
            turnNumber: currentTurn,
            userMessage: sanitizedMessage,
            rawResponse: rawResponseBuffer,
            parseStatus,
            parseError: parseErrorMsg,
            systemMessage: systemMessageContent,
            model: usedModel,
            promptVersion: PROMPT_VERSION,
            latencyMs: totalLatencyMs,
            tokenUsage: tokensUsed
              ? { input: tokensUsed.input, output: tokensUsed.output }
              : undefined,
            retryCount,
          },
        });
      } catch (dbError) {
        console.error('[ChatService] TurnLog persistence failed', {
          sessionId,
          turnNumber: currentTurn,
          error: dbError,
        });
      }

      // Process result
      try {
        if (streamInterrupted) {
          // Req 9.9: post-token failure — persist partial, no retry
          await handleStreamInterrupted(
            controller,
            encoder,
            sessionId,
            sanitizedMessage,
            isVoice,
            partialBuffer,
            categoriesCovered,
          );
        } else if (finalExtraction && finalReply) {
          // SUCCESS: full valid response — score + update state + persist
          await handleSuccessfulTurn(
            controller,
            encoder,
            sessionId,
            sanitizedMessage,
            isVoice,
            finalReply,
            finalExtraction,
            currentTurn,
            session.extractions,
            categoriesCovered as CategoryName[],
            locale,
            sessionContext,
            metadata,
            edgeCase,
          );
        } else if (finalReply && !finalExtraction) {
          // PARTIAL: reply but no extraction — persist messages only
          await handlePartialResponse(
            controller,
            encoder,
            sessionId,
            sanitizedMessage,
            isVoice,
            finalReply,
            categoriesCovered,
            metadata,
            edgeCase,
          );
        } else {
          // FAILURE: degrade to questionnaire mode (Req 9.7)
          await handleDegradation(
            controller,
            encoder,
            sessionId,
            sanitizedMessage,
            isVoice,
            locale,
            categoriesCovered,
          );
        }
      } catch (fatalError) {
        console.error('[ChatService] Fatal error in stream processing', {
          sessionId,
          error: fatalError,
        });
        try {
          const errorEvent: SSEEvent = {
            event: 'error',
            data: { code: 'INTERNAL_ERROR', message: 'Unexpected error', retryable: false },
          };
          controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
        } catch {
          /* controller may already be errored */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
}

// ─── Result Handlers ───

/**
 * Handle crisis detection — transition to TERMINATED, persist, emit crisis SSE event.
 * Requirement 8.8: Crisis/self-harm → TERMINATED state.
 * No scoring or output generation occurs for TERMINATED sessions.
 * Further input for this session is disabled.
 */
async function handleCrisis(
  sessionId: string,
  sanitizedMessage: string,
  isVoice: boolean,
  context: SessionContext,
  crisisInstruction: { message: string; helplineNumbers: { id: string; international: string } },
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  // Transition to TERMINATED via state machine
  const transitionResult = transition(context, { type: 'CRISIS_DETECTED' });

  // Use post-transition context for metadata (state is now TERMINATED)
  const terminatedContext = 'context' in transitionResult ? transitionResult.context : context;

  // Persist: user message + crisis response + TERMINATED state + metadata
  const terminatedMetadata: SessionMetadata = {
    ...parseMetadata(null),
    followedUp: terminatedContext.categoriesFollowedUp,
    followUpTarget: terminatedContext.followUpTarget,
    offTopicCount: terminatedContext.offTopicCount,
    shortAnswerCount: terminatedContext.shortAnswerCount,
    isForceClose: false,
  };

  try {
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
      }),
      prisma.chatMessage.create({
        data: { sessionId, role: 'assistant', content: crisisInstruction.message, isVoice: false },
      }),
      prisma.screeningSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          metadata: {
            ...terminatedMetadata,
            terminated: true,
            terminationReason: 'crisis_detected',
          } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
  } catch (dbError) {
    console.error('[ChatService] Crisis persistence failed', { sessionId, error: dbError });
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Emit crisis SSE error event with helpline numbers
      const crisisEvent: SSEEvent = {
        event: 'error',
        data: {
          code: 'CRISIS_DETECTED',
          message: `${crisisInstruction.message} | Helpline: ${crisisInstruction.helplineNumbers.id} (ID), ${crisisInstruction.helplineNumbers.international} (International)`,
          retryable: false,
        },
      };
      controller.enqueue(encoder.encode(encodeSSE(crisisEvent)));

      // Emit token with crisis message content
      const tokenEvent: SSEEvent = {
        event: 'token',
        data: { content: crisisInstruction.message },
      };
      controller.enqueue(encoder.encode(encodeSSE(tokenEvent)));

      // Emit done event — session is terminated, input disabled
      const donePayload: DonePayload = {
        categoriesCovered: terminatedContext.categoriesCovered,
        isComplete: true,
        mode: 'ai',
      };
      const doneEvent: SSEEvent = { event: 'done', data: donePayload };
      controller.enqueue(encoder.encode(encodeSSE(doneEvent)));

      controller.close();
    },
  });
}

/** Handle stream interrupted after tokens were emitted (Req 9.9) */
async function handleStreamInterrupted(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  sessionId: string,
  sanitizedMessage: string,
  isVoice: boolean,
  partialBuffer: string,
  categoriesCovered: string[],
): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
      }),
      prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: partialBuffer || '[stream interrupted]',
          isVoice: false,
        },
      }),
    ]);
  } catch (dbError) {
    console.error('[ChatService] ChatMessage persistence failed', { sessionId, error: dbError });
    const errorEvent: SSEEvent = {
      event: 'error',
      data: { code: 'PERSISTENCE_ERROR', message: 'Failed to save conversation', retryable: true },
    };
    controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
  }

  const donePayload: DonePayload = {
    categoriesCovered,
    isComplete: false,
    mode: 'ai',
  };
  const doneEvent: SSEEvent = { event: 'done', data: donePayload };
  controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
}

/** Handle successful turn with full extraction (Req 9.3, 9.4, 9.5) */
async function handleSuccessfulTurn(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  sessionId: string,
  sanitizedMessage: string,
  isVoice: boolean,
  reply: string,
  extraction: CategoryExtraction,
  currentTurn: number,
  existingExtractions: Array<{ extraction: unknown; turnNumber: number }>,
  categoriesCovered: CategoryName[],
  locale: SupportedLocale,
  context: SessionContext,
  metadata: SessionMetadata,
  edgeCase: { type: string; shouldAdvance?: boolean },
): Promise<void> {
  // Reconstruct keyword pool from existing extractions
  let pool = createEmptyPool();
  for (const ext of existingExtractions) {
    pool = appendToPool(pool, ext.extraction as unknown as CategoryExtraction, ext.turnNumber);
  }
  pool = appendToPool(pool, extraction, currentTurn);

  // Calculate scores (Req 9.3)
  const scoringResult = calculateAllScores(pool, locale);

  // Update state via transition (Req 9.4)
  const transitionResult = transition(context, {
    type: 'EXTRACTION_RECEIVED',
    extraction,
  });

  // Handle unexpected transition error (state machine invariant violation)
  if ('type' in transitionResult && transitionResult.type === 'INVALID_TRANSITION') {
    console.warn('[ChatService] Unexpected transition error in handleSuccessfulTurn', {
      sessionId,
      from: transitionResult.from,
      event: transitionResult.event,
      message: transitionResult.message,
    });
    // Continue — scoring data is still valid, follow-up tracking skipped this turn
  }

  // Determine updated categories from scoring result (via configurable source of truth)
  const updatedCategoriesCovered = determineCoveredCategories(
    categoriesCovered,
    scoringResult,
    extraction as unknown as Parameters<typeof determineCoveredCategories>[2],
  );

  const isComplete = updatedCategoriesCovered.length >= CATEGORY_ORDER.length;

  // Update metadata — reset or increment edge case counters
  const updatedMetadata: SessionMetadata = { ...metadata };

  // Determine if extraction had significant content (resets off-topic/short answer counters)
  const hasSignificantExtraction = CATEGORY_ORDER.some((cat) => {
    const keywords = extraction[cat];
    return (
      keywords && keywords.some((kw) => kw.confidence === 'medium' || kw.confidence === 'high')
    );
  });

  if (hasSignificantExtraction) {
    updatedMetadata.offTopicCount = 0;
    updatedMetadata.shortAnswerCount = 0;
  } else {
    // Increment edge case counters based on detection
    if (edgeCase.type === 'off_topic') {
      updatedMetadata.offTopicCount += 1;
    } else if (edgeCase.type === 'short_answer') {
      updatedMetadata.shortAnswerCount += 1;
    }
  }

  // Update follow-up tracking if transition produced a FOLLOW_UP state
  if ('context' in transitionResult && transitionResult.context.state === 'FOLLOW_UP') {
    updatedMetadata.followUpTarget = transitionResult.context.followUpTarget;
    if (
      transitionResult.context.followUpTarget &&
      !updatedMetadata.followedUp.includes(transitionResult.context.followUpTarget)
    ) {
      updatedMetadata.followedUp = [
        ...updatedMetadata.followedUp,
        transitionResult.context.followUpTarget,
      ];
    }
  } else {
    updatedMetadata.followUpTarget = null;
  }

  // Persist in single transaction (Req 9.5)
  try {
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
      }),
      prisma.chatMessage.create({
        data: { sessionId, role: 'assistant', content: reply, isVoice: false },
      }),
      prisma.turnExtraction.create({
        data: {
          sessionId,
          turnNumber: currentTurn,
          extraction: extraction as unknown as Prisma.InputJsonValue,
          scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.screeningSession.update({
        where: { id: sessionId },
        data: {
          categoriesCovered: updatedCategoriesCovered as unknown as Prisma.InputJsonValue,
          scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
          totalScore: scoringResult.totalScore,
          riskLevel: scoringResult.riskLevel,
          promptVersion: PROMPT_VERSION,
          scoringVersion: scoringResult.version,
          metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
  } catch (dbError) {
    // P2002: Unique constraint violation — duplicate turn (concurrent request race condition)
    if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2002') {
      console.warn('[ChatService] Duplicate turn detected (concurrent request)', {
        sessionId,
        turnNumber: currentTurn,
      });
      const errorEvent: SSEEvent = {
        event: 'error',
        data: {
          code: 'DUPLICATE_TURN',
          message: 'This turn was already processed',
          retryable: false,
        },
      };
      controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
    } else {
      console.error('[ChatService] Persistence failed', { sessionId, error: dbError });
      const errorEvent: SSEEvent = {
        event: 'error',
        data: {
          code: 'PERSISTENCE_ERROR',
          message: 'Failed to save conversation',
          retryable: true,
        },
      };
      controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
    }
  }

  // Emit done event
  const donePayload: DonePayload = {
    categoriesCovered: updatedCategoriesCovered,
    isComplete,
    mode: 'ai',
  };
  const doneEvent: SSEEvent = { event: 'done', data: donePayload };
  controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
}

/** Handle partial response — reply but no extraction (skip scoring) */
async function handlePartialResponse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  sessionId: string,
  sanitizedMessage: string,
  isVoice: boolean,
  reply: string,
  categoriesCovered: string[],
  metadata: SessionMetadata,
  edgeCase: { type: string },
): Promise<void> {
  // Update metadata counters for edge cases even without extraction
  const updatedMetadata: SessionMetadata = { ...metadata };
  if (edgeCase.type === 'off_topic') {
    updatedMetadata.offTopicCount += 1;
  } else if (edgeCase.type === 'short_answer') {
    updatedMetadata.shortAnswerCount += 1;
  }

  try {
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
      }),
      prisma.chatMessage.create({
        data: { sessionId, role: 'assistant', content: reply, isVoice: false },
      }),
      prisma.screeningSession.update({
        where: { id: sessionId },
        data: { metadata: updatedMetadata as unknown as Prisma.InputJsonValue },
      }),
    ]);
  } catch (dbError) {
    console.error('[ChatService] ChatMessage persistence failed', { sessionId, error: dbError });
    const errorEvent: SSEEvent = {
      event: 'error',
      data: { code: 'PERSISTENCE_ERROR', message: 'Failed to save conversation', retryable: true },
    };
    controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
  }

  const donePayload: DonePayload = {
    categoriesCovered,
    isComplete: false,
    mode: 'ai',
  };
  const doneEvent: SSEEvent = { event: 'done', data: donePayload };
  controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
}

/** Handle complete LLM failure — degrade to questionnaire mode (Req 9.7) */
async function handleDegradation(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  sessionId: string,
  sanitizedMessage: string,
  isVoice: boolean,
  locale: SupportedLocale,
  categoriesCovered: string[],
): Promise<void> {
  const firstUncoveredCategory = CATEGORY_ORDER.find((c) => !categoriesCovered.includes(c));

  const degradationReply =
    locale === 'id'
      ? 'Maaf, terjadi gangguan pada sistem AI. Skrining akan dilanjutkan dengan mode kuesioner.'
      : 'Sorry, the AI system encountered an issue. Screening will continue in questionnaire mode.';

  // Emit LLM_UNAVAILABLE error event
  const streamErrorEvent: SSEEvent = {
    event: 'error',
    data: {
      code: 'LLM_UNAVAILABLE',
      message:
        locale === 'id'
          ? 'Sistem AI tidak tersedia saat ini'
          : 'AI system is currently unavailable',
      retryable: false,
    },
  };
  controller.enqueue(encoder.encode(encodeSSE(streamErrorEvent)));

  // Get pills for first uncovered category
  const pills = firstUncoveredCategory
    ? getPills(locale, firstUncoveredCategory).map((p) => ({ id: p.id, label: p.label }))
    : [];

  // Persist mode change + messages
  try {
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
      }),
      prisma.chatMessage.create({
        data: { sessionId, role: 'assistant', content: degradationReply, isVoice: false },
      }),
      prisma.screeningSession.update({
        where: { id: sessionId },
        data: { mode: 'questionnaire' },
      }),
    ]);
  } catch (dbError) {
    console.error('[ChatService] Degradation persistence failed', { sessionId, error: dbError });
    const errorEvent: SSEEvent = {
      event: 'error',
      data: { code: 'PERSISTENCE_ERROR', message: 'Failed to save conversation', retryable: true },
    };
    controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
  }

  // Emit token with degradation reply
  const tokenEvent: SSEEvent = { event: 'token', data: { content: degradationReply } };
  controller.enqueue(encoder.encode(encodeSSE(tokenEvent)));

  // Emit done event with pills
  const donePayload: DonePayload = {
    categoriesCovered,
    isComplete: false,
    mode: 'questionnaire',
    pills,
    pillSelection: 'multi',
  };
  const doneEvent: SSEEvent = { event: 'done', data: donePayload };
  controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
}

// ─── Output Generation ───

/**
 * Generate final 4-part output after all categories are covered or max turns reached.
 * Uses `buildOutputContext` from lib/chat/output and follows 2-attempt budget (Req 7.9).
 *
 * On LLM success: persists aiConclusion, aiPerceptionResponse, aiRecommendation, aiSuggestion.
 * On LLM failure after 2 attempts: serves static fallback via getFallbackTemplate.
 * Marks session status as COMPLETED.
 *
 * @deprecated Use `generateSessionOutput` instead — this wrapper exists for backward compat.
 */
export async function generateOutput(
  sessionId: string,
  preloadedSession?: {
    id: string;
    locale: string;
    mode: string;
    perception: string | null;
    messages: Array<{
      id: string;
      sessionId: string;
      role: string;
      content: string;
      isVoice: boolean;
      createdAt: Date;
    }>;
    extractions: Array<{
      id: string;
      sessionId: string;
      turnNumber: number;
      extraction: unknown;
      scores: unknown;
      createdAt: Date;
    }>;
  },
): Promise<ReadableStream<Uint8Array>> {
  return generateSessionOutput(sessionId, {
    isForceClose: false,
    preloadedSession: preloadedSession as unknown as LoadedSession,
  });
}

// ─── Public Utilities ───

/**
 * Determines whether output generation should be triggered.
 * Returns trigger=true if all 6 categories are covered or message count >= 14.
 */
export function shouldTriggerOutput(
  categoriesCovered: string[],
  messageCount: number,
): { trigger: boolean; isForceClose: boolean } {
  const allCovered = categoriesCovered.length >= CATEGORY_ORDER.length;

  if (allCovered) {
    return { trigger: true, isForceClose: false };
  }

  if (messageCount >= CONFIG.sessionLimits.MAX_MESSAGES) {
    return { trigger: true, isForceClose: true };
  }

  return { trigger: false, isForceClose: false };
}

// ─── Generate Session Output (Public API) ───

interface GenerateOutputOptions {
  isForceClose?: boolean;
  preloadedSession?: unknown;
}

/**
 * Public API for output generation. Called when session is complete
 * (all categories covered) or force-closed (max turns reached).
 *
 * Orchestrates: score calculation → output context → LLM generation → persistence.
 * Falls back to static templates on LLM failure after 2 attempts.
 */
export async function generateSessionOutput(
  sessionId: string,
  options?: GenerateOutputOptions,
): Promise<ReadableStream<Uint8Array>> {
  const isForceClose = options?.isForceClose ?? false;

  // 1. Load session (or use preloaded)
  const session = options?.preloadedSession
    ? (options.preloadedSession as LoadedSession)
    : await prisma.screeningSession.findUnique({
        where: { id: sessionId },
        include: {
          demographics: true,
          messages: { orderBy: { createdAt: 'asc' } },
          extractions: { orderBy: { turnNumber: 'asc' } },
        },
      });

  if (!session) {
    throw new NotFoundError(`Session not found: ${sessionId}`);
  }

  // 2. Validate session state
  if (session.status !== 'IN_PROGRESS') {
    throw new ValidationError(`Session is not in progress (status: ${session.status})`);
  }

  // 3. Reconstruct pool from TurnExtraction records
  let pool = createEmptyPool();
  for (const ext of session.extractions) {
    pool = appendToPool(pool, ext.extraction as unknown as CategoryExtraction, ext.turnNumber);
  }

  // 4. Calculate final scores
  const locale = session.locale as SupportedLocale;
  const scoringResult = calculateAllScores(pool, locale);

  // 5. Determine theme
  const educationLevel = normalizeEducationLevel(
    (session as LoadedSession).demographics?.educationLevel,
  );
  const theme = selectTheme(educationLevel);

  // 6. Build output context via lib/chat
  const categoriesCovered = parseCategoriesCovered(session.categoriesCovered);
  const matchedKeywords: Record<CategoryName, string[]> = {} as Record<CategoryName, string[]>;
  const categoryScores: Record<CategoryName, number> = {} as Record<CategoryName, number>;

  for (const category of CATEGORY_ORDER) {
    const catScore = scoringResult.scores[category];
    matchedKeywords[category] = catScore?.matchedPatterns ?? [];
    categoryScores[category] = catScore?.capped ?? 0;
  }

  const perception =
    (session.perception as 'UNDERESTIMATE' | 'OVERESTIMATE' | 'BARRIER' | 'ADEQUATE') ?? 'ADEQUATE';

  const _chatOutputContext = buildOutputContext({
    riskLevel: scoringResult.riskLevel,
    perception,
    locale,
    theme,
    categoriesAssessed: categoriesCovered as CategoryName[],
    matchedKeywords,
    scores: categoryScores,
    totalScore: scoringResult.totalScore,
    isForceClose,
  });

  // 7. Build LLM output context for prompt builder
  const llmOutputContext: LLMOutputContext = {
    scores: Object.fromEntries(
      CATEGORY_ORDER.map((cat) => [cat, scoringResult.scores[cat]?.capped ?? 0]),
    ),
    riskLevel: scoringResult.riskLevel,
    matchedKeywords: matchedKeywords as Record<string, string[]>,
    perception,
    locale,
    theme,
  };

  // 8. Build messages with conversation history
  const history: Array<{ role: 'assistant' | 'user'; content: string }> = (
    session.messages as Array<{ role: string; content: string }>
  ).map((msg) => ({
    role: msg.role as 'assistant' | 'user',
    content: msg.content,
  }));
  const messages = buildOutputMessages(llmOutputContext, history);

  // 9. Execute LLM call with 2-attempt budget
  const config = getLLMConfig();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let outputResult: {
        conclusion: string;
        perceptionResponse: string | null;
        recommendation: string;
        personalizedSuggestion: string | null;
      } | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const fallbackClient = getFallbackClient();
        const fallbackModel = getFallbackModel();
        const isPrimaryAttempt = attempt === 1;
        const client = isPrimaryAttempt
          ? getPrimaryClient()
          : (fallbackClient ?? getPrimaryClient());
        const model = isPrimaryAttempt ? config.model : (fallbackModel ?? config.model);
        const timeout = isPrimaryAttempt ? config.timeoutMs : config.retryTimeoutMs;

        try {
          const response = await client.chat.completions.create(
            {
              model,
              messages,
              temperature: config.temperatureOutput,
              max_tokens: config.maxTokensOutput,
              top_p: config.topP,
              response_format: { type: 'json_object' },
            },
            { timeout },
          );

          const content = response.choices[0]?.message?.content;
          if (!content) continue;

          const parseResult = parseOutputResponse(content);

          if (parseResult.status === 'success') {
            outputResult = parseResult.data;
            break;
          }
        } catch {
          if (attempt === 2) break;
        }
      }

      // Emit result or fallback
      if (outputResult) {
        // Persist output fields + COMPLETED status
        try {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              aiConclusion: outputResult.conclusion,
              aiPerceptionResponse: outputResult.perceptionResponse,
              aiRecommendation: outputResult.recommendation,
              aiSuggestion: outputResult.personalizedSuggestion,
              perception,
              scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
              totalScore: scoringResult.totalScore,
              riskLevel: scoringResult.riskLevel,
              metadata: isForceClose
                ? ({
                    ...parseMetadata(session.metadata),
                    isForceClose: true,
                  } as unknown as Prisma.InputJsonValue)
                : undefined,
            },
          });
        } catch (dbError) {
          console.error('[ChatService] Output persistence failed', { sessionId, error: dbError });
        }

        const donePayload: DonePayload = {
          categoriesCovered: CATEGORY_ORDER,
          isComplete: true,
          mode: 'ai',
          result: {
            totalScore: scoringResult.totalScore,
            riskLevel: scoringResult.riskLevel,
            scores: categoryScores as Record<string, number>,
            conclusion: outputResult.conclusion,
            perceptionResponse: outputResult.perceptionResponse,
            recommendation: outputResult.recommendation,
            personalizedSuggestion: outputResult.personalizedSuggestion,
          },
        };

        const doneEvent: SSEEvent = { event: 'done', data: donePayload };
        controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
      } else {
        // Fallback: static templates (Req 7.9)
        const fallback = getFallbackTemplate(scoringResult.riskLevel, locale);

        try {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              aiConclusion: fallback.kesimpulan,
              aiPerceptionResponse: fallback.persepsi,
              aiRecommendation: fallback.rekomendasi,
              aiSuggestion: fallback.saranPenanganan,
              scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
              totalScore: scoringResult.totalScore,
              riskLevel: scoringResult.riskLevel,
              metadata: isForceClose
                ? ({
                    ...parseMetadata(session.metadata),
                    isForceClose: true,
                  } as unknown as Prisma.InputJsonValue)
                : undefined,
            },
          });
        } catch (dbError) {
          console.error('[ChatService] Fallback persistence failed', { sessionId, error: dbError });
        }

        const donePayload: DonePayload = {
          categoriesCovered: CATEGORY_ORDER,
          isComplete: true,
          mode: 'ai',
          result: {
            totalScore: scoringResult.totalScore,
            riskLevel: scoringResult.riskLevel,
            scores: categoryScores as Record<string, number>,
            conclusion: fallback.kesimpulan,
            perceptionResponse: fallback.persepsi,
            recommendation: fallback.rekomendasi,
            personalizedSuggestion: fallback.saranPenanganan,
          },
        };

        const doneEvent: SSEEvent = { event: 'done', data: donePayload };
        controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
      }

      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
}

// ─── Internal Types ───

interface LoadedSession {
  id: string;
  locale: string;
  mode: string;
  status: string;
  perception: string | null;
  categoriesCovered: unknown;
  metadata: unknown;
  messages: Array<{ role: string; content: string }>;
  extractions: Array<{ turnNumber: number; extraction: unknown }>;
  demographics?: { educationLevel?: string; age?: number; gender?: string } | null;
}

// ─── Questionnaire Mode Processing ───

export interface ChatQuestionnaireResponse {
  reply: string;
  mode: 'questionnaire';
  status: 'in_progress' | 'completed';
  categoriesCovered: string[];
  isComplete: boolean;
  pills?: Array<{ id: string; label: string }>;
  pillSelection?: 'single' | 'multi';
  result?: { totalScore: number; riskLevel: string };
}

/** Category question prompts per locale */
const CATEGORY_QUESTIONS: Record<string, Record<CategoryName, string>> = {
  id: {
    intensitas: 'Seberapa parah rasa gatalnya? Pilih yang sesuai:',
    waktu: 'Kapan biasanya gatal terasa paling mengganggu?',
    lokasi_tubuh: 'Di bagian tubuh mana saja yang terasa gatal?',
    kontak: 'Apakah ada orang di sekitarmu yang juga mengalami gatal serupa?',
    lesi: 'Seperti apa tampilan kulit yang gatal? Pilih yang sesuai:',
    faktor_risiko: 'Bagaimana kondisi tempat tinggalmu? Pilih yang sesuai:',
  },
  en: {
    intensitas: 'How severe is the itching? Select what applies:',
    waktu: 'When is the itching most bothersome?',
    lokasi_tubuh: 'Which body areas are affected?',
    kontak: 'Is anyone around you experiencing similar itching?',
    lesi: 'What does the itchy skin look like? Select what applies:',
    faktor_risiko: 'What are your living conditions like? Select what applies:',
  },
};

const COMPLETION_MESSAGES: Record<string, string> = {
  id: 'Terima kasih! Semua pertanyaan sudah dijawab. Berikut hasil skrining kamu.',
  en: 'Thank you! All questions have been answered. Here are your screening results.',
};

const CANCEL_MESSAGES: Record<string, string> = {
  id: 'Skrining dibatalkan. Terima kasih telah menggunakan SICAPS.',
  en: 'Screening cancelled. Thank you for using SICAPS.',
};

/**
 * Process a questionnaire pill selection answer.
 * Validates session state, scores pills, advances to next category or completes.
 * Returns standard JSON response (not SSE).
 *
 * Requirements: 2.2
 */
export async function processQuestionnaireAnswer(
  sessionId: string,
  selectedPills: string[],
): Promise<ChatQuestionnaireResponse> {
  // 1. Load session
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { demographics: true },
  });

  // 2. Validate session
  if (!session) {
    throw new SessionNotFoundError();
  }

  if (session.status !== 'IN_PROGRESS') {
    throw new SessionCompletedError();
  }

  if (session.mode !== 'questionnaire') {
    throw new ValidationError('Session is not in questionnaire mode');
  }

  // 3. Parse state from session
  const categoriesCovered = parseCategoriesCovered(session.categoriesCovered);
  const existingScores = parseScores(session.scores);
  const locale = (session.locale as SupportedLocale) || 'id';

  // 4. Handle cancellation
  if (selectedPills.includes('confirm_cancel')) {
    const cancelReply: string =
      CANCEL_MESSAGES[locale] ?? CANCEL_MESSAGES['id'] ?? 'Screening cancelled.';

    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { sessionId, role: 'user', content: 'confirm_cancel', isVoice: false },
      }),
      prisma.chatMessage.create({
        data: { sessionId, role: 'assistant', content: cancelReply, isVoice: false },
      }),
      prisma.screeningSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
    ]);

    return {
      reply: cancelReply,
      mode: 'questionnaire',
      status: 'completed',
      categoriesCovered,
      isComplete: true,
    };
  }

  // 5. Determine current category (first uncovered)
  const currentCategory = CATEGORY_ORDER.find((c) => !categoriesCovered.includes(c));

  if (!currentCategory) {
    // All categories already covered — shouldn't happen, but handle gracefully
    throw new ValidationError('All categories already assessed');
  }

  // 6. Look up pills and sum scores
  let categoryScore = 0;
  const pillLabels: string[] = [];

  for (const pillId of selectedPills) {
    const pill = getPillById(locale, pillId);
    if (pill) {
      categoryScore += pill.score;
      pillLabels.push(pill.label);
    }
  }

  // 7. Update state
  const updatedCategoriesCovered = [...categoriesCovered, currentCategory];
  const updatedScores = { ...existingScores, [currentCategory]: categoryScore };

  // 8. Check if all categories are now covered
  const allCovered = updatedCategoriesCovered.length >= CATEGORY_ORDER.length;

  let totalScore: number | undefined;
  let riskLevel: string | undefined;
  let botReply: string;
  let pills: Array<{ id: string; label: string }> | undefined;
  let pillSelection: 'single' | 'multi' | undefined;

  if (allCovered) {
    // Calculate final score
    totalScore = Object.values(updatedScores).reduce(
      (sum: number, s) => sum + (typeof s === 'number' ? s : 0),
      0,
    );
    riskLevel = getRiskLevel(totalScore);
    botReply = COMPLETION_MESSAGES[locale] ?? COMPLETION_MESSAGES['id'] ?? 'Screening complete.';
  } else {
    // Determine next category and prepare pills
    const nextCategory = CATEGORY_ORDER.find((c) => !updatedCategoriesCovered.includes(c));
    if (nextCategory) {
      const nextPills = getPills(locale, nextCategory);
      pills = nextPills.map((p) => ({ id: p.id, label: p.label }));
      pillSelection = 'multi';
      const localeQuestions = CATEGORY_QUESTIONS[locale];
      const fallbackQuestions = CATEGORY_QUESTIONS['id'];
      botReply =
        localeQuestions?.[nextCategory] ??
        fallbackQuestions?.[nextCategory] ??
        'Please select what applies:';
    } else {
      botReply = COMPLETION_MESSAGES[locale] ?? COMPLETION_MESSAGES['id'] ?? 'Screening complete.';
    }
  }

  // 9. Persist in transaction
  const userContent = pillLabels.length > 0 ? pillLabels.join(', ') : selectedPills.join(', ');

  const sessionUpdateData: Record<string, unknown> = {
    categoriesCovered: updatedCategoriesCovered,
    scores: updatedScores,
  };

  if (allCovered && totalScore !== undefined && riskLevel !== undefined) {
    sessionUpdateData.totalScore = totalScore;
    sessionUpdateData.riskLevel = riskLevel;
    sessionUpdateData.status = 'COMPLETED';
    sessionUpdateData.completedAt = new Date();
  }

  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { sessionId, role: 'user', content: userContent, isVoice: false },
    }),
    prisma.chatMessage.create({
      data: { sessionId, role: 'assistant', content: botReply, isVoice: false },
    }),
    prisma.screeningSession.update({
      where: { id: sessionId },
      data: sessionUpdateData as Prisma.ScreeningSessionUpdateInput,
    }),
  ]);

  // 10. Return response
  const response: ChatQuestionnaireResponse = {
    reply: botReply,
    mode: 'questionnaire',
    status: allCovered ? 'completed' : 'in_progress',
    categoriesCovered: updatedCategoriesCovered,
    isComplete: allCovered,
  };

  if (pills) {
    response.pills = pills;
    response.pillSelection = pillSelection;
  }

  if (allCovered && totalScore !== undefined && riskLevel !== undefined) {
    response.result = { totalScore, riskLevel };
  }

  return response;
}
