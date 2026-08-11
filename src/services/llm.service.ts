import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';
import { sanitizeUserInput } from '@/lib/sanitize';
import {
  getPrimaryClient,
  getFallbackClient,
  getLLMConfig,
  getFallbackModel,
  getFallbackOutput,
} from '@/lib/llm';
import {
  parseLLMResponse,
  parseOutputResponse,
  extractReplyFromPartial,
  buildMessages,
  buildOutputMessages,
  encodeSSE,
  createReplyDetector,
  PROMPT_VERSION,
  appendToPool,
  calculateAllScores,
  getPills,
} from '@/features/screening-chat-v1/internal';
import type {
  PromptSessionContext as SessionContext,
  PromptOutputContext as OutputContext,
  SSEEvent,
  DonePayload,
  KeywordPool,
  CategoryExtraction,
  CategoryName,
} from '@/features/screening-chat-v1/internal';
import { CONFIG } from '@/lib/config';
import { NotFoundError, ValidationError } from '@/lib/errors';

/** Default category ordering for degradation/uncovered category detection */
const CATEGORY_ORDER: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

/** Empty keyword pool for initialization */
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

/** Structured metadata logged per LLM call */
interface LLMCallMetadata {
  sessionId: string;
  turn: number;
  callType: 'chat' | 'output' | 'health';
  attempt: number;
  latencyMs: number;
  ttfbMs: number;
  model: string;
  success: boolean;
  jsonValid: boolean;
  schemaValid: boolean;
  errorType?: 'timeout' | 'http_error' | 'json_parse' | 'schema_invalid' | 'network';
}

/**
 * Process a single chat turn. Orchestrates:
 * 1. Load session + validate state
 * 2. Build prompt messages
 * 3. Stream LLM call (up to 2 attempts)
 * 4. Parse + validate response
 * 5. Score extraction via scoring engine
 * 6. Persist messages + extraction
 * 7. Return ReadableStream of SSE events
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

  // 3. Check max turn limit (14 messages = 7 user turns)
  const messageCount = session.messages.length;
  if (messageCount >= CONFIG.sessionLimits.MAX_MESSAGES) {
    return generateOutput(sessionId, session);
  }

  // 4. Build session context
  const categoriesCovered = (session.categoriesCovered as string[]) || [];
  const categoriesRemaining = CATEGORY_ORDER.filter((c) => !categoriesCovered.includes(c));
  const currentTurn = Math.floor(messageCount / 2) + 1;

  const demographics = session.demographics;
  const sessionContext: SessionContext = {
    theme: 'hybrid',
    locale: session.locale as 'id' | 'en',
    turn: currentTurn,
    demographics: {
      age: demographics?.age ?? 18,
      gender: demographics?.gender ?? 'unknown',
    },
    categoriesCovered,
    categoriesRemaining,
  };

  // 5. Sanitize user input before LLM prompt and persistence
  const sanitizedMessage = sanitizeUserInput(message);

  // 6. Build history from existing messages (assistant reply only, not full JSON)
  const history: Array<{ role: 'assistant' | 'user'; content: string }> = session.messages.map(
    (msg) => ({
      role: msg.role as 'assistant' | 'user',
      content: msg.content,
    }),
  );

  // 7. Build prompt messages
  const messages = buildMessages(sessionContext, history, sanitizedMessage);

  // 8. Execute streaming LLM call with "no retry after first token" policy
  //
  // Flow:
  //   Attempt 1: try stream → first token emitted? NO → retry. YES → committed.
  //   Attempt 2: try stream → success or fail → no more retries.
  //   Post-token failure: STREAM_INTERRUPTED event, partial log, no TurnExtraction.
  //   Both fail pre-token: LLM_UNAVAILABLE event, degrade to questionnaire.
  //
  const config = getLLMConfig();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let finalReply: string | null = null;
      let finalExtraction: CategoryExtraction | null = null;
      let jsonValid = false;
      let totalLatencyMs = 0;
      let totalTtfbMs = 0;

      // Critical invariant: once tokens have been emitted to the client, the stream
      // is committed. No retry is allowed regardless of subsequent parse outcome.
      let firstTokenEmitted = false;

      // Track whether stream was interrupted post-token (for result handling)
      let streamInterrupted = false;
      let partialBuffer = '';

      // TurnLog tracking variables
      let usedModel = config.model;
      let retryCount = 0;
      let tokensUsed: { input: number; output: number } | null = null;
      let rawResponseBuffer = '';
      let parseErrorMsg: string | null = null;

      // Extract system message content for TurnLog persistence
      const systemMessageContent = (messages[0]?.content as string) || '';

      // Attempt loop: max 2 attempts, but only if no tokens were emitted
      for (let attempt = 1; attempt <= 2; attempt++) {
        const startTime = Date.now();
        let ttfbMs = 0;
        let accumulatedBuffer = '';

        // Select client and model for this attempt
        const fallbackClient = getFallbackClient();
        const fallbackModel = getFallbackModel();
        const isPrimaryAttempt = attempt === 1;
        const client = isPrimaryAttempt
          ? getPrimaryClient()
          : (fallbackClient ?? getPrimaryClient());
        const model = isPrimaryAttempt ? config.model : (fallbackModel ?? config.model);
        const timeout = isPrimaryAttempt ? config.timeoutMs : config.retryTimeoutMs;

        // Track model and retry count for TurnLog
        usedModel = model;
        if (attempt > 1) {
          retryCount = attempt - 1;
        }

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

            // Use reply detector to separate forwardable tokens from extraction
            const { forwardable } = detector.feed(delta);
            if (forwardable) {
              firstTokenEmitted = true;
              const tokenEvent: SSEEvent = { event: 'token', data: { content: forwardable } };
              controller.enqueue(encoder.encode(encodeSSE(tokenEvent)));
            }
          }

          totalLatencyMs = Date.now() - startTime;
          totalTtfbMs = ttfbMs;

          // Capture raw response buffer for TurnLog
          rawResponseBuffer = accumulatedBuffer;

          // Collect token usage from the last chunk if available
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
            jsonValid = true;

            logLLMCall({
              sessionId,
              turn: currentTurn,
              callType: 'chat',
              attempt,
              latencyMs: totalLatencyMs,
              ttfbMs: totalTtfbMs,
              model,
              success: true,
              jsonValid: true,
              schemaValid: true,
            });
            break; // Success — exit retry loop
          }

          if (parseResult.status === 'partial') {
            jsonValid = true;
            finalReply = parseResult.reply;
            parseErrorMsg = 'Schema validation failed — reply recovered but extraction missing';

            logLLMCall({
              sessionId,
              turn: currentTurn,
              callType: 'chat',
              attempt,
              latencyMs: totalLatencyMs,
              ttfbMs: totalTtfbMs,
              model,
              success: false,
              jsonValid: true,
              schemaValid: false,
              errorType: 'schema_invalid',
            });

            // KEY INVARIANT: if tokens were already emitted, this stream is committed.
            // Do NOT retry — accept the partial result.
            if (firstTokenEmitted) {
              break;
            }

            // Pre-token partial (unlikely but possible with non-reply JSON) — retry
            continue;
          }

          // Parse failure
          jsonValid = parseResult.classification !== 'json_parse_error';
          parseErrorMsg =
            parseResult.classification === 'json_parse_error'
              ? 'JSON parse error'
              : `Schema invalid: ${parseResult.classification}`;

          logLLMCall({
            sessionId,
            turn: currentTurn,
            callType: 'chat',
            attempt,
            latencyMs: Date.now() - startTime,
            ttfbMs,
            model,
            success: false,
            jsonValid,
            schemaValid: false,
            errorType:
              parseResult.classification === 'json_parse_error' ? 'json_parse' : 'schema_invalid',
          });

          // KEY INVARIANT: if tokens were already emitted, stream is committed — no retry
          if (firstTokenEmitted) {
            const extracted = extractReplyFromPartial(accumulatedBuffer);
            if (extracted) {
              finalReply = extracted;
            }
            break;
          }

          // Pre-token failure — retry allowed
          if (attempt === 2) {
            // Last attempt, try to extract reply from buffer
            const extracted = extractReplyFromPartial(accumulatedBuffer);
            if (extracted) {
              finalReply = extracted;
            }
          }
        } catch (error) {
          totalLatencyMs = Date.now() - startTime;
          totalTtfbMs = ttfbMs;

          const errorType = classifyError(error);

          // Capture error details for TurnLog
          rawResponseBuffer = accumulatedBuffer;
          parseErrorMsg = error instanceof Error ? error.message : `LLM call failed: ${errorType}`;

          logLLMCall({
            sessionId,
            turn: currentTurn,
            callType: 'chat',
            attempt,
            latencyMs: totalLatencyMs,
            ttfbMs: totalTtfbMs,
            model,
            success: false,
            jsonValid: false,
            schemaValid: false,
            errorType,
          });

          // KEY INVARIANT: if tokens were already emitted, stream is committed — no retry
          if (firstTokenEmitted) {
            // Stream interrupted after tokens sent → emit STREAM_INTERRUPTED, no retry
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
            break; // Exit loop — NO retry after first token
          }

          // Pre-token failure — retry allowed
          if (attempt === 2) {
            // Both attempts failed at network/timeout level before any token
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

      // Persist TurnLog (ALWAYS — success, partial, or failure)
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
        console.error('[LLM] TurnLog persistence failed', {
          sessionId,
          turnNumber: currentTurn,
          error: dbError,
        });
      }

      // Process result based on the outcome.
      // Outer try/catch/finally guarantees controller.close() is ALWAYS called,
      // even if an unexpected error occurs during result processing.
      try {
        if (streamInterrupted) {
          // POST-TOKEN FAILURE: stream broke after tokens were emitted.
          // Log partial response, do NOT create TurnExtraction, persist messages.
          try {
            await prisma.$transaction([
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'user',
                  content: sanitizedMessage,
                  isVoice,
                },
              }),
              // Store whatever partial reply was streamed
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
            console.error('[LLM] ChatMessage persistence failed', {
              sessionId,
              turnNumber: currentTurn,
              error: dbError,
            });
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

          // Emit done event (stream was partially delivered)
          const donePayload: DonePayload = {
            categoriesCovered,
            isComplete: false,
            mode: 'ai',
          };

          const doneEvent: SSEEvent = { event: 'done', data: donePayload };
          controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
        } else if (finalExtraction && finalReply) {
          // SUCCESS: full valid response
          // Reconstruct pool from existing TurnExtraction records
          let pool = createEmptyPool();
          for (const ext of session.extractions) {
            pool = appendToPool(
              pool,
              ext.extraction as unknown as CategoryExtraction,
              ext.turnNumber,
            );
          }
          // Add new extraction
          pool = appendToPool(pool, finalExtraction, currentTurn);

          // Score
          const locale = session.locale as 'id' | 'en';
          const scoringResult = calculateAllScores(pool, locale);

          // Determine updated categories covered
          const updatedCategoriesCovered = [
            ...new Set([
              ...categoriesCovered,
              ...CATEGORY_ORDER.filter((cat) => {
                const catScore = scoringResult.scores[cat];
                return catScore && catScore.status === 'assessed';
              }),
            ]),
          ];

          const isComplete = updatedCategoriesCovered.length >= CATEGORY_ORDER.length;

          // Persist: user message + bot reply + extraction (no llmMetadata — moved to TurnLog)
          try {
            await prisma.$transaction([
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'user',
                  content: sanitizedMessage,
                  isVoice,
                },
              }),
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'assistant',
                  content: finalReply,
                  isVoice: false,
                },
              }),
              prisma.turnExtraction.create({
                data: {
                  sessionId,
                  turnNumber: currentTurn,
                  extraction: finalExtraction as unknown as Prisma.InputJsonValue,
                  scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
                },
              }),
              prisma.screeningSession.update({
                where: { id: sessionId },
                data: {
                  categoriesCovered: updatedCategoriesCovered,
                  scores: scoringResult.scores as unknown as Prisma.InputJsonValue,
                  totalScore: scoringResult.totalScore,
                  riskLevel: scoringResult.riskLevel,
                  promptVersion: PROMPT_VERSION,
                  scoringVersion: scoringResult.version,
                },
              }),
            ]);
          } catch (dbError) {
            console.error('[LLM] Persistence failed', {
              sessionId,
              turnNumber: currentTurn,
              error: dbError,
            });
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

          // Emit done event
          const donePayload: DonePayload = {
            categoriesCovered: updatedCategoriesCovered,
            isComplete,
            mode: 'ai',
          };

          const doneEvent: SSEEvent = { event: 'done', data: donePayload };
          controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
        } else if (finalReply && !finalExtraction) {
          // PARTIAL: reply recovered but no valid extraction — skip scoring
          try {
            await prisma.$transaction([
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'user',
                  content: sanitizedMessage,
                  isVoice,
                },
              }),
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'assistant',
                  content: finalReply,
                  isVoice: false,
                },
              }),
            ]);
          } catch (dbError) {
            console.error('[LLM] ChatMessage persistence failed', {
              sessionId,
              turnNumber: currentTurn,
              error: dbError,
            });
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

          const donePayload: DonePayload = {
            categoriesCovered,
            isComplete: false,
            mode: 'ai',
          };

          const doneEvent: SSEEvent = { event: 'done', data: donePayload };
          controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
        } else {
          // FAILURE: no reply recoverable — degrade to questionnaire mode
          // Both attempts failed before any token was emitted
          const locale = session.locale as 'id' | 'en';
          const firstUncoveredCategory = CATEGORY_ORDER.find((c) => !categoriesCovered.includes(c));

          // Determine degradation reply
          const degradationReply =
            locale === 'id'
              ? 'Maaf, terjadi gangguan pada sistem AI. Skrining akan dilanjutkan dengan mode kuesioner.'
              : 'Sorry, the AI system encountered an issue. Screening will continue in questionnaire mode.';

          // Emit SSE error event for LLM unavailability
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
                data: {
                  sessionId,
                  role: 'user',
                  content: sanitizedMessage,
                  isVoice,
                },
              }),
              prisma.chatMessage.create({
                data: {
                  sessionId,
                  role: 'assistant',
                  content: degradationReply,
                  isVoice: false,
                },
              }),
              prisma.screeningSession.update({
                where: { id: sessionId },
                data: { mode: 'questionnaire' },
              }),
            ]);
          } catch (dbError) {
            console.error('[LLM] Degradation persistence failed', {
              sessionId,
              turnNumber: currentTurn,
              error: dbError,
            });
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

          // Emit token event for the degradation reply
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
      } catch (fatalError) {
        // Unexpected error in result processing — emit error event and close gracefully
        console.error('[LLM] Fatal error in stream processing', { sessionId, error: fatalError });
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

/**
 * Generate final 4-part output after all categories are covered or max turns reached.
 * Follows same 2-attempt budget. Falls back to static templates on failure.
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
  // 1. Load session + extractions + messages (or use preloaded)
  const session =
    preloadedSession ??
    (await prisma.screeningSession.findUnique({
      where: { id: sessionId },
      include: {
        demographics: true,
        messages: { orderBy: { createdAt: 'asc' } },
        extractions: { orderBy: { turnNumber: 'asc' } },
      },
    }));

  if (!session) {
    throw new NotFoundError(`Session not found: ${sessionId}`);
  }

  // 2. Reconstruct pool from TurnExtraction records
  let pool = createEmptyPool();
  for (const ext of session.extractions) {
    pool = appendToPool(pool, ext.extraction as unknown as CategoryExtraction, ext.turnNumber);
  }

  // 3. Calculate final scores
  const locale = session.locale as 'id' | 'en';
  const scoringResult = calculateAllScores(pool, locale);

  // 4. Build output context
  const matchedKeywords: Record<string, string[]> = {};
  for (const category of CATEGORY_ORDER) {
    const catScore = scoringResult.scores[category];
    matchedKeywords[category] = catScore?.matchedPatterns ?? [];
  }

  const outputContext: OutputContext = {
    scores: Object.fromEntries(
      CATEGORY_ORDER.map((cat) => [cat, scoringResult.scores[cat]?.capped ?? 0]),
    ),
    riskLevel: scoringResult.riskLevel,
    matchedKeywords,
    perception: session.perception as OutputContext['perception'],
    locale,
    theme: 'hybrid',
  };

  // 5. Build output messages with history (assistant replies only)
  const history: Array<{ role: 'assistant' | 'user'; content: string }> = session.messages.map(
    (msg) => ({
      role: msg.role as 'assistant' | 'user',
      content: msg.content,
    }),
  );
  const messages = buildOutputMessages(outputContext, history);

  // 6. Execute LLM call with 2-attempt budget
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
        const startTime = Date.now();

        // Select client and model for this attempt
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
              stream: false,
              response_format: { type: 'json_object' },
            },
            { timeout },
          );

          const latencyMs = Date.now() - startTime;
          const content = response.choices[0]?.message?.content ?? '';
          const parseResult = parseOutputResponse(content);

          if (parseResult.status === 'success') {
            outputResult = parseResult.data;

            logLLMCall({
              sessionId,
              turn: Math.floor(session.messages.length / 2),
              callType: 'output',
              attempt,
              latencyMs,
              ttfbMs: latencyMs,
              model,
              success: true,
              jsonValid: true,
              schemaValid: true,
            });
            break; // Success — exit retry loop
          }

          // Parse failed
          logLLMCall({
            sessionId,
            turn: Math.floor(session.messages.length / 2),
            callType: 'output',
            attempt,
            latencyMs,
            ttfbMs: latencyMs,
            model,
            success: false,
            jsonValid: parseResult.classification !== 'json_parse_error',
            schemaValid: false,
            errorType:
              parseResult.classification === 'json_parse_error' ? 'json_parse' : 'schema_invalid',
          });
        } catch (error) {
          const latencyMs = Date.now() - startTime;
          const errorType = classifyError(error);

          logLLMCall({
            sessionId,
            turn: Math.floor(session.messages.length / 2),
            callType: 'output',
            attempt,
            latencyMs,
            ttfbMs: 0,
            model,
            success: false,
            jsonValid: false,
            schemaValid: false,
            errorType,
          });
        }
      }

      // 7. Determine final result
      if (!outputResult) {
        // Both attempts failed — use fallback template
        const fallback = getFallbackOutput(locale, scoringResult.riskLevel);
        outputResult = fallback;
      }

      // Outer try/finally guarantees controller.close() is ALWAYS called.
      try {
        // 8. Persist output fields on ScreeningSession
        try {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: {
              aiConclusion: outputResult.conclusion,
              aiPerceptionResponse: outputResult.perceptionResponse,
              aiRecommendation: outputResult.recommendation,
              aiSuggestion: outputResult.personalizedSuggestion,
              status: 'COMPLETED',
              completedAt: new Date(),
              scores: JSON.parse(JSON.stringify(scoringResult.scores)),
              totalScore: scoringResult.totalScore,
              riskLevel: scoringResult.riskLevel,
              promptVersion: PROMPT_VERSION,
              scoringVersion: scoringResult.version,
            },
          });
        } catch (dbError) {
          console.error('[LLM] Output persistence failed', { sessionId, error: dbError });
        }

        // 9. Stream result as SSE events
        // Emit token event with the conclusion text
        const tokenEvent: SSEEvent = {
          event: 'token',
          data: { content: outputResult.conclusion },
        };
        controller.enqueue(encoder.encode(encodeSSE(tokenEvent)));

        // Build capped scores for the done payload
        const cappedScores: Record<string, number> = {};
        for (const cat of CATEGORY_ORDER) {
          cappedScores[cat] = scoringResult.scores[cat]?.capped ?? 0;
        }

        // Emit done event with full result
        const donePayload: DonePayload = {
          categoriesCovered: [...CATEGORY_ORDER],
          isComplete: true,
          mode: session.mode as 'ai' | 'questionnaire',
          result: {
            totalScore: scoringResult.totalScore,
            riskLevel: scoringResult.riskLevel,
            scores: cappedScores,
            conclusion: outputResult.conclusion,
            perceptionResponse: outputResult.perceptionResponse,
            recommendation: outputResult.recommendation,
            personalizedSuggestion: outputResult.personalizedSuggestion,
          },
        };

        const doneEvent: SSEEvent = { event: 'done', data: donePayload };
        controller.enqueue(encoder.encode(encodeSSE(doneEvent)));
      } catch (fatalError) {
        console.error('[LLM] Fatal error in output stream processing', {
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

/**
 * Lightweight LLM availability probe (max_tokens: 1, short timeout).
 * Returns boolean — never throws.
 */
export async function checkLLMHealth(): Promise<boolean> {
  try {
    const client = getPrimaryClient();
    const config = getLLMConfig();

    const response = await client.chat.completions.create(
      {
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      },
      { timeout: config.healthTimeoutMs },
    );

    return response.choices.length > 0;
  } catch {
    return false;
  }
}

/** Classify an error into a structured type for logging */
function classifyError(error: unknown): 'timeout' | 'http_error' | 'network' {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
      return 'timeout';
    }
    // Check for OpenAI SDK APIError (has status property)
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      return 'http_error';
    }
  }
  // Check if it's an object with a status code (e.g., OpenAI APIError)
  if (error !== null && typeof error === 'object' && 'status' in error) {
    const status = (error as Record<string, unknown>).status;
    if (typeof status === 'number' && status >= 400) {
      return 'http_error';
    }
  }
  return 'network';
}

/** Log structured metadata for an LLM call */
function logLLMCall(metadata: LLMCallMetadata): void {
  const level = metadata.success ? 'info' : metadata.attempt < 2 ? 'warn' : 'error';
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;

  logFn('[LLM]', {
    ...metadata,
    level,
    timestamp: new Date().toISOString(),
  });
}
