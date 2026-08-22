/**
 * Chat Service - Screening Chat V2
 *
 * Orchestrates the per-turn pipeline:
 * lock -> crisis -> save -> context -> extract -> validate -> merge -> correct
 * -> conflict -> transition -> compose -> save -> unlock -> stream
 *
 * Progressive degradation:
 * - Extract fail -> skip extraction, compose normally
 * - Compose fail -> static template based on dimensiBelum[0]
 * - Both fail -> generic error message
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4
 */

import { Perception, PerceptionStep, Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';
import { getPrimaryClient, getLLMConfig } from '@/lib/llm';
import { sanitizeUserInput } from '@/lib/sanitize';
import { SessionBusyError } from '@/lib/errors';
import { typingDelayMs } from '@/lib/typing-pace';

import { checkCrisis } from '../domain/chat/crisis';
import { mergeCoverage } from '../domain/chat/coverage';
import { applyCorrections } from '../domain/chat/correction';
import { nextPhase, shouldNudge, updateStagnation } from '../domain/chat/state-machine';
import { validateExtraction } from '../domain/scoring/validator';
import {
  calculateRisk,
  deriveGatalMalam,
  deriveAsrama,
  deriveTukarAlat,
  getChipsCoverageKeywords,
} from '../domain/scoring/engine';
import {
  LOCK_TTL,
  CHIPS_ORDER,
  CHIPS_EXCLUSIVE_DIMENSIONS,
  FINISH_REASON_TRUNCATED,
  LLM_MAX_ATTEMPTS,
  LLM_RETRY_TOKEN_MULTIPLIER,
  LLM_MAX_TOKENS_CEILING,
  COMPOSE_KICKOFF_MESSAGE,
} from '../domain/config';
import {
  getBotText,
  buildFallbackTemplate,
  buildHardLimitMessage,
  pickChipsIntro,
  type Locale,
} from '../domain/chat/bot-text';
import { checkChipsTrigger } from '../domain/chat/chips-state';
import { parseChipsAnswer, validateChipsAnswer } from '../domain/chat/chips-handler';
import type { ChipsAnswer } from '../domain/chat/chips-handler';
import {
  detectConflict,
  detectDimensionConflict,
  buildClarificationQuestion,
  parseClarificationResponse,
} from '../domain/chat/conflict';
import type { ConflictDimension } from '../domain/chat/conflict';
import { validateShortAnswer } from '../domain/chat/short-answer-validator';
import { isLeakedReply } from '../domain/chat/reply-guard';
import { buildInstructionContext, buildWarmupPrompt } from '../domain/chat/instruction';
import {
  incrementAttempts,
  getSkippedDimensions,
  applyDimensionSkips,
} from '../domain/chat/dimension-limiter';
import { finalize } from './screening.service';
import type {
  SessionPhase,
  SSEEvent,
  ChipsType,
  ChipsSubState,
  ToneTheme,
  ScoringState,
  InstructionContext,
} from '../domain/types';

import { buildExtractMessages, buildComposeMessages } from '../adapters/llm/prompts';
import type { ChatMessage, LLMMessage } from '../adapters/llm/prompts';
import { parseExtraction } from '../adapters/llm/parser';
import { formatSSE } from '../adapters/llm/stream-helpers';
import type { RawExtraction } from '../adapters/llm/schemas';

// Map chips type to dimension name for coverage updates
const CHIPS_TO_DIMENSION: Record<string, string> = {
  kontak: 'kontak',
  lokasi: 'lokasi_tubuh',
  asrama: 'faktor_risiko',
  tukar_alat: 'faktor_risiko',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatTurnInput {
  sessionId: string;
  message: string;
  quickReplyToken?: string;
  isVoice: boolean;
}

/** Shape returned by acquireLock - all fields needed for the pipeline. */
interface SessionLock {
  id: string;
  locale: string;
  phase: string;
  turnCount: number;
  dimensiTerisi: unknown;
  dimensiBelum: string[];
  hasilDitampilkan: boolean;
  partial: boolean;
  perception: string | null;
  chipsAnswered: unknown;
  chipsSubState: unknown;
  toneTheme: unknown;
  gatalMalam: unknown;
  kontakSerupa: unknown;
  lokasiKhas: unknown;
  asrama: unknown;
  tukarAlat: unknown;
  lastChipsTurn: unknown;
  conflictDimension: unknown;
  conflictClarified: unknown;
  stagnationCount: unknown;
  perceptionStartTurn: number | null;
  /**
   * Which perception question is outstanding, or null when the phase has been
   * entered but nothing has been asked yet. Answers are only attributed to a
   * question this says was actually asked.
   */
  perceptionStep: PerceptionStep | null;
  /**
   * The session's photo row, if one has been submitted. Loaded alongside the
   * session so the phase snapshot can tell whether the image gate is satisfied
   * without a second round trip.
   */
  image: { visualResult: string | null } | null;
}

/** Mutable pipeline state passed through steps. */
interface PipelineState {
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  scoringState: ScoringState;
  chipsAnswered: ChipsType[];
  extractionSucceeded: boolean;
  correctionChanged: boolean;
  conflictClarificationSent: boolean;
  stagnationCount: number;
  lastChipsTurn: number;
  chipsSignals: string[];
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Process a single chat turn through the full pipeline.
 *
 * Returns a ReadableStream with SSE events for real-time client streaming.
 * Implements optimistic locking, crisis detection, LLM extraction + compose,
 * and progressive degradation on failure.
 */
export async function processChatTurn(input: ChatTurnInput): Promise<ReadableStream<Uint8Array>> {
  const { sessionId, message, quickReplyToken, isVoice } = input;
  const sanitizedMessage = sanitizeUserInput(message);

  // Step 1: Optimistic lock - acquire
  const session = await acquireLock(sessionId);

  const encoder = new TextEncoder();

  // Resolved before the crisis check: every bot-facing string in this turn,
  // including the crisis escalation, must be in the session's language.
  const locale: Locale = session.locale === 'en' ? 'en' : 'id';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Step 2: Crisis check
        const crisisResult = checkCrisis(sanitizedMessage, locale);

        if (crisisResult.detected) {
          await handleCrisisDetected(
            controller,
            encoder,
            session,
            sanitizedMessage,
            isVoice,
            crisisResult.response,
            locale,
          );
          return;
        }

        // Step 3: Save user message
        await prisma.chatMessage.create({
          data: { sessionId, role: 'user', content: sanitizedMessage, isVoice },
        });

        // Step 4: Load context - last 10 messages + session state
        const recentMessages = await loadRecentMessages(sessionId);
        const turnCount = session.turnCount + 1;
        const chipsSubState = (session.chipsSubState || 'FREE_TEXT') as ChipsSubState;

        // Build mutable pipeline state
        const pipe: PipelineState = {
          dimensiTerisi: session.dimensiTerisi as Record<
            string,
            { keywords: string[]; negasi: string[] }
          >,
          dimensiBelum: session.dimensiBelum,
          scoringState: {
            gatalMalam: (session.gatalMalam as boolean) ?? false,
            kontakSerupa: (session.kontakSerupa as boolean) ?? false,
            lokasiKhas: (session.lokasiKhas as boolean) ?? false,
            asrama: (session.asrama as boolean) ?? false,
            tukarAlat: (session.tukarAlat as boolean) ?? false,
          },
          chipsAnswered: (session.chipsAnswered || []) as ChipsType[],
          extractionSucceeded: false,
          correctionChanged: false,
          conflictClarificationSent: false,
          stagnationCount: (session.stagnationCount as number) ?? 0,
          lastChipsTurn: (session.lastChipsTurn as number) ?? 0,
          chipsSignals: [],
        };

        const conflictDimension = (session.conflictDimension as string) ?? null;
        const conflictClarified = (session.conflictClarified as boolean) ?? false;
        const previousDimensiBelum = [...pipe.dimensiBelum];
        let chipsTriggeredThisTurn = false;

        // Step 4b: Handle chips answer if CHIPS_ACTIVE
        if (chipsSubState.startsWith('CHIPS_ACTIVE')) {
          await handleChipsAnswer(
            sessionId,
            chipsSubState,
            sanitizedMessage,
            turnCount,
            pipe,
            locale,
          );

          // Emit scoring event after chips answer
          if (pipe.extractionSucceeded) {
            const riskResult = calculateRisk(pipe.scoringState);
            emitSSE(controller, encoder, {
              type: 'scoring',
              data: {
                state: pipe.scoringState,
                riskLevel: riskResult.riskLevel,
                chipsAnswered: pipe.chipsAnswered,
              },
            });
          }

          // Proactive: trigger next chips if available
          const unansweredChips = CHIPS_ORDER.filter((ct) => !pipe.chipsAnswered.includes(ct));
          if (unansweredChips.length > 0) {
            const nextChips = unansweredChips[0]!;
            const introText = pickChipsIntro(nextChips, locale);
            await typingDelay(introText);
            emitSSE(controller, encoder, { type: 'token', data: introText });
            const chipsRequest = buildChipsRequest(nextChips, locale);
            emitSSE(controller, encoder, { type: 'chips_request', data: chipsRequest });
            chipsTriggeredThisTurn = true;

            await prisma.screeningSession.update({
              where: { id: sessionId },
              data: { chipsSubState: `CHIPS_ACTIVE:${nextChips}` },
            });

            await prisma.chatMessage.create({
              data: { sessionId, role: 'assistant', content: introText, isVoice: false },
            });
          }
        }

        // Step 5: Free-text extraction path (only during COLLECTING phase)
        let rawExtractionResponse: string | null = null;
        const shouldExtract =
          !chipsSubState.startsWith('CHIPS_ACTIVE') &&
          (session.phase === 'COLLECTING' || session.phase === 'GREETING');
        if (shouldExtract) {
          rawExtractionResponse = await handleFreeTextExtraction({
            sessionId,
            session,
            sanitizedMessage,
            quickReplyToken,
            turnCount,
            locale,
            recentMessages,
            conflictDimension,
            conflictClarified,
            pipe,
          });

          // Emit scoring event after extraction
          if (pipe.extractionSucceeded) {
            const riskResult = calculateRisk(pipe.scoringState);
            emitSSE(controller, encoder, {
              type: 'scoring',
              data: {
                state: pipe.scoringState,
                riskLevel: riskResult.riskLevel,
                chipsAnswered: pipe.chipsAnswered,
              },
            });
          }

          // Check if extraction signalled a chips-eligible dimension (R1/R2 enforced)
          if (pipe.extractionSucceeded && !pipe.conflictClarificationSent) {
            const chipsToTrigger = checkChipsTrigger(
              pipe.chipsSignals,
              pipe.chipsAnswered,
              turnCount,
              pipe.lastChipsTurn,
            );

            if (chipsToTrigger.length > 0) {
              const nextChips = chipsToTrigger[0]!;
              const introText = pickChipsIntro(nextChips, locale);
              await typingDelay(introText);
              emitSSE(controller, encoder, { type: 'token', data: introText });
              const chipsRequest = buildChipsRequest(nextChips, locale);
              emitSSE(controller, encoder, { type: 'chips_request', data: chipsRequest });
              chipsTriggeredThisTurn = true;

              await prisma.screeningSession.update({
                where: { id: sessionId },
                data: { chipsSubState: `CHIPS_ACTIVE:${nextChips}` },
              });

              // Save intro as bot message
              await prisma.chatMessage.create({
                data: { sessionId, role: 'assistant', content: introText, isVoice: false },
              });
            }
          }
        }

        // Step 10: Update stagnation tracking
        pipe.stagnationCount = updateStagnation(
          previousDimensiBelum,
          pipe.dimensiBelum,
          pipe.stagnationCount,
        );

        // Step 10-limiter: Dimension attempt limiter (max attempts per dimension)
        // Only increment when bot actually asked an LLM question (not during chips turns)
        if (
          (session.phase === 'COLLECTING' || session.phase === 'GREETING') &&
          !chipsTriggeredThisTurn &&
          !chipsSubState.startsWith('CHIPS_ACTIVE')
        ) {
          const attempts = incrementAttempts(sessionId, pipe.dimensiBelum);
          const skipped = getSkippedDimensions(attempts, pipe.dimensiBelum);
          if (skipped.length > 0) {
            const skipResult = applyDimensionSkips(pipe.dimensiTerisi, pipe.dimensiBelum, skipped);
            pipe.dimensiTerisi = skipResult.dimensiTerisi;
            pipe.dimensiBelum = skipResult.dimensiBelum;
            await logAudit(sessionId, 'dimensions_skipped', {
              skipped,
              turn: turnCount,
              reason: 'max_attempts_exceeded',
            });
          }
        }

        // Step 10-proactive: Proactive chips trigger
        // Runs AFTER dimension-limiter so skipped dimensions are accounted for.
        // Runs regardless of extractionSucceeded — chips readiness depends on
        // accumulated state, not this turn's extraction.
        if (!chipsTriggeredThisTurn && !pipe.conflictClarificationSent) {
          const nonChipsDimsBelum = pipe.dimensiBelum.filter(
            (d) => !CHIPS_EXCLUSIVE_DIMENSIONS.includes(d),
          );
          const unansweredChips = CHIPS_ORDER.filter((ct) => !pipe.chipsAnswered.includes(ct));

          if (nonChipsDimsBelum.length === 0 && unansweredChips.length > 0) {
            const nextChips = unansweredChips[0]!;
            const introText = pickChipsIntro(nextChips, locale);
            await typingDelay(introText);
            emitSSE(controller, encoder, { type: 'token', data: introText });
            const chipsRequest = buildChipsRequest(nextChips, locale);
            emitSSE(controller, encoder, { type: 'chips_request', data: chipsRequest });
            chipsTriggeredThisTurn = true;

            await prisma.screeningSession.update({
              where: { id: sessionId },
              data: { chipsSubState: `CHIPS_ACTIVE:${nextChips}` },
            });

            // Save intro as bot message
            await prisma.chatMessage.create({
              data: { sessionId, role: 'assistant', content: introText, isVoice: false },
            });
          }
        }

        // Step 10a: Perception classification via LLM
        // 2-step flow: turn 1 = severity → ask barrier, turn 2 = barrier → set perception
        let currentPerception = session.perception as Perception | null;
        let perceptionSeverityDetected = false;

        // Which question this turn's message is answering. Null means the phase
        // has been entered but nothing has been asked yet, so there is nothing
        // for the message to be an answer to.
        //
        // This is the guard that matters. Without it a reply to the bot's own
        // "Siap lanjut?" after a failed photo analysis was fed to the classifier,
        // read as "no barrier", and resolved perception to ADEQUATE before the
        // severity question had ever been asked.
        const askedStep = session.perceptionStep ?? null;
        let nextPerceptionStep: PerceptionStep | null = askedStep;

        if (
          session.phase === 'ASKING_PERCEPTION' &&
          askedStep !== null &&
          !currentPerception &&
          !chipsSubState.startsWith('CHIPS_ACTIVE')
        ) {
          const classification = await classifyPerceptionAnswer(
            sanitizedMessage,
            askedStep,
            locale,
          );

          await logAudit(sessionId, 'perception_classification', {
            turn: turnCount,
            userMessage: sanitizedMessage,
            askedStep,
            classification,
            method:
              classification.severity || classification.barrier || classification.noBarrier
                ? 'resolved'
                : 'unresolved',
          });

          if (classification.barrier) {
            // Barrier detected — set BARRIER immediately
            currentPerception = 'BARRIER';
            await prisma.screeningSession.update({
              where: { id: sessionId },
              data: { perception: currentPerception },
            });
            emitSSE(controller, encoder, { type: 'perception', data: currentPerception });
            await logAudit(sessionId, 'perception_set', {
              turn: turnCount,
              perception: 'BARRIER',
              trigger: 'barrier_detected',
              barrierType: classification.barrier,
            });
          } else if (classification.noBarrier) {
            // User explicitly said no barrier → ADEQUATE
            currentPerception = 'ADEQUATE';
            await prisma.screeningSession.update({
              where: { id: sessionId },
              data: { perception: currentPerception },
            });
            emitSSE(controller, encoder, { type: 'perception', data: currentPerception });
            await logAudit(sessionId, 'perception_set', {
              turn: turnCount,
              perception: 'ADEQUATE',
              trigger: 'no_barrier_explicit',
            });
          } else if (classification.severity) {
            // Severity detected, no barrier signal → ask barrier next
            perceptionSeverityDetected = true;
            await logAudit(sessionId, 'perception_severity_detected', {
              turn: turnCount,
              severity: classification.severity,
              nextStep: 'ask_barrier',
            });
          }
          // If nothing detected → compose handler will ask clarification
        }

        // Step 10b: Update session state
        await prisma.screeningSession.update({
          where: { id: sessionId },
          data: {
            dimensiTerisi: pipe.dimensiTerisi as unknown as Prisma.InputJsonValue,
            dimensiBelum: pipe.dimensiBelum,
            turnCount,
            stagnationCount: pipe.stagnationCount,
            lastChipsTurn: pipe.lastChipsTurn,
            gatalMalam: pipe.scoringState.gatalMalam,
          },
        });

        // Step 11: Phase transition
        // Don't transition when chips just triggered — wait for user to finish chips flow first
        const imageResolved = session.image?.visualResult != null;
        const snapshot = {
          phase: session.phase as SessionPhase,
          dimensiBelum: pipe.dimensiBelum,
          perception: currentPerception,
          hasilDitampilkan: session.hasilDitampilkan,
          crisisDetected: false,
          turnCount,
          partial: session.partial,
          chipsAnswered: pipe.chipsAnswered,
          stagnationCount: pipe.stagnationCount,
          imageResolved,
        };
        let newPhase = chipsTriggeredThisTurn
          ? (session.phase as SessionPhase)
          : nextPhase(snapshot);

        // Guard: never regress past AWAITING_IMAGE. If the DB phase is already
        // past the image gate (ASKING_PERCEPTION, SCREENING_COMPLETE, CLOSED),
        // trust that advancePhaseAfterImage already resolved it — the Prisma
        // relation query can return null even when the image row exists, and
        // re-computing the phase from a stale snapshot must not undo progress.
        const PHASES_PAST_IMAGE_GATE: SessionPhase[] = [
          'ASKING_PERCEPTION',
          'SCREENING_COMPLETE',
          'CLOSED',
        ];
        if (
          newPhase === 'AWAITING_IMAGE' &&
          PHASES_PAST_IMAGE_GATE.includes(session.phase as SessionPhase)
        ) {
          // Ask again with the gate treated as satisfied rather than pinning to
          // the stored phase. Pinning froze the session on whatever phase the
          // stale read happened to catch, so a session whose perception was
          // already answered could sit in ASKING_PERCEPTION indefinitely.
          newPhase = nextPhase({ ...snapshot, imageResolved: true });
        }

        if (newPhase !== session.phase) {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: {
              phase: newPhase,
              ...(newPhase === 'CLOSED' ? { status: 'COMPLETED', completedAt: new Date() } : {}),
              // R5: mark partial if soft-completing with dimensions remaining
              ...(newPhase === 'ASKING_PERCEPTION' && pipe.dimensiBelum.length > 0
                ? { partial: true }
                : {}),
            },
          });

          await logAudit(sessionId, 'phase_transition', {
            from: session.phase,
            to: newPhase,
            turn: turnCount,
            softCompleted: pipe.dimensiBelum.length > 0 && newPhase === 'ASKING_PERCEPTION',
          });
        }

        // Emit phase event
        emitSSE(controller, encoder, { type: 'phase', data: newPhase });

        // Emit extraction event
        emitSSE(controller, encoder, {
          type: 'extraction',
          data: {
            dimensiTerisi: Object.keys(pipe.dimensiTerisi),
            dimensiBelum: pipe.dimensiBelum,
            dimensiDetail: pipe.dimensiTerisi,
          },
        });

        // Emit quick replies if applicable
        emitQuickReplies(controller, encoder, newPhase);

        // Step 12: LLM Compose (or conflict clarification, or skip if chips triggered)
        let botReply: string;

        if (chipsTriggeredThisTurn) {
          // Chips just triggered — don't compose a separate question (prevents 2 questions in 1 turn)
          botReply = '';
        } else if (pipe.conflictClarificationSent) {
          // Conflict detected - send clarification question instead of LLM compose
          const conflictDim = (
            await prisma.screeningSession.findUnique({
              where: { id: sessionId },
              select: { conflictDimension: true },
            })
          )?.conflictDimension as ConflictDimension | null;

          botReply = buildClarificationQuestion(conflictDim ?? 'kontak', locale);
          emitSSE(controller, encoder, { type: 'token', data: botReply });
        } else if (newPhase === 'ASKING_PERCEPTION') {
          // Perception compose: 2-step approach
          // Step 1: Ask severity ("ringan/ganggu/khawatir?")
          // Step 2: Ask barrier based on severity answer
          //
          // Which of the two to send is decided by `askedStep`, the record of what
          // has already been asked. It used to be inferred from `session.phase`
          // plus `currentPerception`, which conflated "just arrived in this phase"
          // with "already finished it" — both fell to the same branch, so a
          // session that had answered the perception question got the severity
          // question re-composed on every turn.
          if (askedStep === null) {
            // Nothing asked yet — open with the severity question.
            const perceptionPrompt = buildPerceptionSeverityPrompt(
              pipe.dimensiTerisi,
              pipe.scoringState,
              locale,
            );
            const perceptionResult = await attemptComposeWithPrompt(
              controller,
              encoder,
              perceptionPrompt,
              locale,
            );
            botReply = perceptionResult ?? getBotText(locale).perceptionSeverity;
            if (!perceptionResult) {
              emitSSE(controller, encoder, { type: 'token', data: botReply });
            }
            nextPerceptionStep = 'ASK_SEVERITY';
          } else {
            // A question is outstanding and this turn is the answer to it.
            //
            // `currentPerception` is necessarily still null here: `nextPhase` only
            // returns ASKING_PERCEPTION while perception is null, and the snapshot
            // it reads carries this turn's value. A perception resolved earlier in
            // the turn leaves this phase on that same turn rather than lingering
            // here with nothing left to ask.
            if (perceptionSeverityDetected) {
              // Severity answered but no barrier detected — ask barrier as follow-up
              const barrierPrompt = buildBarrierFollowUpPrompt(sanitizedMessage, locale);
              const barrierResult = await attemptComposeWithPrompt(
                controller,
                encoder,
                barrierPrompt,
                locale,
              );
              botReply = barrierResult ?? getBotText(locale).perceptionBarrier;
              if (!barrierResult) {
                emitSSE(controller, encoder, { type: 'token', data: botReply });
              }
              nextPerceptionStep = 'ASK_BARRIER';
            } else {
              // No severity or barrier detected from regex — try LLM one more time
              // with focused prompt before giving up
              const wasBarrierQuestion = askedStep === 'ASK_BARRIER';

              const retryPrompt = buildPerceptionRetryPrompt(
                sanitizedMessage,
                wasBarrierQuestion,
                locale,
              );

              let resolved = false;
              try {
                const client = getPrimaryClient();
                const llmConfig = getLLMConfig();
                const retryResponse = await client.chat.completions.create(
                  {
                    model: llmConfig.model,
                    messages: [{ role: 'system', content: retryPrompt }],
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    max_tokens: 40,
                  },
                  { timeout: 5000 },
                );
                const retryContent = retryResponse.choices[0]?.message?.content;
                if (retryContent) {
                  const retryParsed = JSON.parse(retryContent);
                  // Each reading is only accepted for the question that was
                  // actually asked. A barrier verdict on the severity turn is an
                  // answer to a question the santri never saw.
                  if (wasBarrierQuestion) {
                    if (retryParsed.noBarrier === true || retryParsed.barrier === null) {
                      currentPerception = 'ADEQUATE';
                      resolved = true;
                    } else if (retryParsed.barrier) {
                      currentPerception = 'BARRIER';
                      resolved = true;
                    }
                  } else if (retryParsed.severity) {
                    // Severity detected on retry — ask barrier
                    perceptionSeverityDetected = true;
                    resolved = true;
                  }
                }
              } catch {
                // LLM retry also failed
              }

              if (resolved && currentPerception) {
                await prisma.screeningSession.update({
                  where: { id: sessionId },
                  data: { perception: currentPerception },
                });
                emitSSE(controller, encoder, { type: 'perception', data: currentPerception });
                botReply = '';
              } else if (resolved && perceptionSeverityDetected) {
                // Severity detected on retry — ask barrier
                const barrierPrompt = buildBarrierFollowUpPrompt(sanitizedMessage, locale);
                const barrierResult = await attemptComposeWithPrompt(
                  controller,
                  encoder,
                  barrierPrompt,
                  locale,
                );
                botReply = barrierResult ?? getBotText(locale).perceptionBarrierShort;
                if (!barrierResult) {
                  emitSSE(controller, encoder, { type: 'token', data: botReply });
                }
                nextPerceptionStep = 'ASK_BARRIER';
              } else {
                // LLM also couldn't classify — default based on context
                // Use perceptionStartTurn to accurately count turns in perception phase
                const perceptionStart = session.perceptionStartTurn ?? turnCount;
                const turnsInPerception = turnCount - perceptionStart + 1;
                if (turnsInPerception >= 3 || wasBarrierQuestion) {
                  currentPerception = 'ADEQUATE';
                  await prisma.screeningSession.update({
                    where: { id: sessionId },
                    data: { perception: currentPerception },
                  });
                  emitSSE(controller, encoder, { type: 'perception', data: currentPerception });
                  botReply = '';
                } else {
                  botReply = getBotText(locale).perceptionClarify;
                  emitSSE(controller, encoder, { type: 'token', data: botReply });
                }
              }
            }
          }
        } else if (newPhase === 'AWAITING_IMAGE') {
          // Static photo request — no LLM. Left to the generic compose branch the
          // model would invent another clinical question, because nothing in the
          // prompt tells it the turn is waiting on an upload rather than an answer.
          botReply = getBotText(locale).imageGateOpening;
          // Skipping the LLM also skips the pause every other phase gets for free,
          // and the request would otherwise land the instant the santri hits send.
          await typingDelay(botReply);
          emitSSE(controller, encoder, { type: 'token', data: botReply });
        } else if (newPhase === 'SCREENING_COMPLETE') {
          // Screening done — finalize scoring, send short closing message
          let finalRiskLevel: 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
          try {
            const finalResult = await finalize(sessionId);
            finalRiskLevel = finalResult.riskLevel;
            await prisma.screeningSession.update({
              where: { id: sessionId },
              data: { hasilDitampilkan: true },
            });
          } catch {
            // Non-critical
          }

          // Emit result event so frontend can record to history
          emitSSE(controller, encoder, {
            type: 'result',
            data: {
              revision: 1,
              riskLevel: finalRiskLevel,
              totalScore: 0,
            },
          });

          // Short static farewell — no LLM needed, keep it fast
          botReply = getBotText(locale).screeningComplete;
          emitSSE(controller, encoder, { type: 'token', data: botReply });
        } else if (newPhase === 'CLOSED' && session.phase !== 'CLOSED') {
          // Hard limit or forced close — send informative farewell instead of generic fallback
          botReply = buildHardLimitMessage(pipe.dimensiBelum, locale);
          emitSSE(controller, encoder, { type: 'token', data: botReply });
        } else {
          // Warmup check: first turn in COLLECTING + no clinical info found → natural open-ended question
          const extractedNewDimensions =
            Object.keys(pipe.dimensiTerisi).length > 0 &&
            Object.values(pipe.dimensiTerisi).some((d) => d.keywords.length > 0);
          const isWarmupTurn =
            turnCount === 1 && newPhase === 'COLLECTING' && !extractedNewDimensions;

          if (isWarmupTurn) {
            // Use warmup prompt — natural, open-ended, no dimension-specific questions
            const warmupPrompt = buildWarmupPrompt(locale);
            const warmupResult = await attemptComposeWithPrompt(
              controller,
              encoder,
              warmupPrompt,
              locale,
            );
            botReply = warmupResult ?? getBotText(locale).warmup;
            if (!warmupResult) {
              emitSSE(controller, encoder, { type: 'token', data: botReply });
            }
          } else {
            const instructionContext = buildInstructionContext({
              phase: newPhase,
              dimensiTerisi: pipe.dimensiTerisi,
              dimensiBelum: pipe.dimensiBelum,
              turnCount,
              locale,
              shouldNudge: shouldNudge(snapshot),
              scoringState: pipe.scoringState,
              chipsSubState: chipsSubState,
              toneTheme: (session.toneTheme || 'hybrid') as ToneTheme,
              perception: currentPerception,
            });

            const composeSucceeded = await attemptCompose(
              controller,
              encoder,
              newPhase,
              instructionContext,
              recentMessages,
            );

            if (composeSucceeded) {
              botReply = composeSucceeded;
            } else if (!pipe.extractionSucceeded) {
              // Both extract and compose failed (Req 7.3)
              botReply = getBotText(locale).technicalError;
              emitSSE(controller, encoder, {
                type: 'error',
                data: { code: 'LLM_UNAVAILABLE', message: 'LLM API failed (possible rate limit)' },
              });
              await logAudit(sessionId, 'llm_degraded', { turn: turnCount });
            } else {
              // Compose failed but extraction worked (Req 7.2) - use template
              botReply = buildFallbackTemplate(pipe.dimensiBelum, locale);
              emitSSE(controller, encoder, { type: 'token', data: botReply });
              await logAudit(sessionId, 'llm_compose_failed', { turn: turnCount });
            }
          }
        }

        // Step 12b: Record which perception question this turn just put on the
        // table, so the next turn can attribute the answer to it.
        //
        // `perceptionStartTurn` is stamped here rather than on the phase
        // transition because entering the phase and asking the question are not
        // the same event: an upload can move the session into ASKING_PERCEPTION
        // without asking anything. Counting from the transition made the
        // "give up and default" escape hatch measure a window that had not opened
        // yet.
        if (nextPerceptionStep !== askedStep) {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: {
              perceptionStep: nextPerceptionStep,
              ...(askedStep === null && nextPerceptionStep === 'ASK_SEVERITY'
                ? { perceptionStartTurn: turnCount }
                : {}),
            },
          });
          await logAudit(sessionId, 'perception_step_asked', {
            turn: turnCount,
            from: askedStep,
            to: nextPerceptionStep,
          });
        }

        // Step 13: Save bot message (skip if empty — chips-only turn)
        if (botReply) {
          await prisma.chatMessage.create({
            data: { sessionId, role: 'assistant', content: botReply, isVoice: false },
          });
        }

        // Step 13b: Save TurnLog for console/testing observability
        await saveTurnLog({
          sessionId,
          turnCount,
          sanitizedMessage,
          rawExtractionResponse,
          pipe,
          newPhase,
          recentMessages,
          locale,
          snapshot,
          botReply,
        });

        // Emit done event
        emitSSE(controller, encoder, { type: 'done', data: { turnCount } });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Log error for server-side debugging
        console.error('[chat.service] processChatTurn failed', {
          sessionId,
          error: errorMessage,
          stack: errorStack,
        });

        emitSSE(controller, encoder, {
          type: 'error',
          data: { code: 'INTERNAL_ERROR', message: errorMessage },
        });
      } finally {
        // Step 14: Unlock - always release lock
        try {
          await prisma.screeningSession.update({
            where: { id: sessionId },
            data: { processing: false },
          });
        } catch {
          // Best effort unlock
        }
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Step 4b: Chips Answer Handler
// ---------------------------------------------------------------------------

async function handleChipsAnswer(
  sessionId: string,
  chipsSubState: ChipsSubState,
  message: string,
  turnCount: number,
  pipe: PipelineState,
  locale: Locale,
): Promise<void> {
  const activeChipsType = parseActiveChipsType(chipsSubState);
  if (!activeChipsType) return;

  const chipsAnswer: ChipsAnswer = parseChipsInput(activeChipsType, message);
  const validationError = validateChipsAnswer(chipsAnswer);
  if (validationError) return;

  const scoringUpdate = parseChipsAnswer(chipsAnswer);

  // Conflict check: LLM previously extracted opposite value?
  if (activeChipsType === 'kontak' && typeof scoringUpdate.kontakSerupa === 'boolean') {
    const chipsVal: boolean = scoringUpdate.kontakSerupa;
    const extractedKontak = (pipe.dimensiTerisi['kontak']?.keywords?.length ?? 0) > 0 ? true : null;
    const hasConflict = detectConflict(extractedKontak, chipsVal);
    if (hasConflict) {
      await logAudit(sessionId, 'conflict_detected', {
        dimension: 'kontak',
        extractedValue: extractedKontak,
        chipsValue: scoringUpdate.kontakSerupa,
        turn: turnCount,
      });
    }
  }

  // Update scoring state
  pipe.scoringState = { ...pipe.scoringState, ...scoringUpdate };

  // Update dimension coverage from chips answer
  const dimension = CHIPS_TO_DIMENSION[activeChipsType];
  if (dimension) {
    // Locale-matched so the risk-factor derivations can read these back.
    const coverage = getChipsCoverageKeywords(locale);

    let dimKeywords: string[] = [];
    if (activeChipsType === 'kontak') {
      dimKeywords = scoringUpdate.kontakSerupa ? [coverage.kontakYes] : [];
    } else if (activeChipsType === 'lokasi') {
      // Selections are the canonical chips tokens, which stay Indonesian.
      dimKeywords = chipsAnswer.selections.filter((s) => s !== 'Lainnya');
    } else if (activeChipsType === 'asrama') {
      dimKeywords = scoringUpdate.asrama ? [coverage.asramaYes] : [];
    } else if (activeChipsType === 'tukar_alat') {
      dimKeywords = scoringUpdate.tukarAlat ? [coverage.tukarAlatYes] : [];
    }

    const negasi =
      activeChipsType === 'kontak' && !scoringUpdate.kontakSerupa ? [coverage.kontakNo] : [];

    // Append to existing entry or create new
    const existing = pipe.dimensiTerisi[dimension];
    if (existing) {
      // Merge keywords (append new, deduplicate)
      const mergedKeywords = [...new Set([...existing.keywords, ...dimKeywords])];
      const mergedNegasi = [...new Set([...existing.negasi, ...negasi])];
      pipe.dimensiTerisi = {
        ...pipe.dimensiTerisi,
        [dimension]: { keywords: mergedKeywords, negasi: mergedNegasi },
      };
    } else {
      pipe.dimensiTerisi = {
        ...pipe.dimensiTerisi,
        [dimension]: { keywords: dimKeywords, negasi },
      };
    }

    // Remove from dimensiBelum if still there
    pipe.dimensiBelum = pipe.dimensiBelum.filter((d) => d !== dimension);
  }

  // Mark chips as answered + update lastChipsTurn for R2 gap enforcement
  pipe.chipsAnswered = [...pipe.chipsAnswered, activeChipsType];
  pipe.lastChipsTurn = turnCount;

  // Persist chips answer results
  await prisma.screeningSession.update({
    where: { id: sessionId },
    data: {
      chipsSubState: 'FREE_TEXT',
      chipsAnswered: pipe.chipsAnswered,
      kontakSerupa: pipe.scoringState.kontakSerupa,
      lokasiKhas: pipe.scoringState.lokasiKhas,
      asrama: pipe.scoringState.asrama,
      tukarAlat: pipe.scoringState.tukarAlat,
      dimensiTerisi: pipe.dimensiTerisi as unknown as Prisma.InputJsonValue,
      dimensiBelum: pipe.dimensiBelum,
      lastChipsTurn: pipe.lastChipsTurn,
      turnCount,
    },
  });

  pipe.extractionSucceeded = true;
}

// ---------------------------------------------------------------------------
// Step 5/6: Free-Text Extraction (includes R3, conflict resolution)
// ---------------------------------------------------------------------------

interface FreeTextExtractionInput {
  sessionId: string;
  session: SessionLock;
  sanitizedMessage: string;
  quickReplyToken?: string;
  turnCount: number;
  locale: 'id' | 'en';
  recentMessages: ChatMessage[];
  conflictDimension: string | null;
  conflictClarified: boolean;
  pipe: PipelineState;
}

/**
 * Handle free-text extraction path:
 * 1. Conflict clarification response (if active conflict)
 * 2. Quick-reply bypass
 * 3. Short answer validation (R3)
 * 4. Full LLM extraction
 * 5. Post-extraction conflict detection
 *
 * Returns raw extraction response string for logging, or null.
 */
async function handleFreeTextExtraction(input: FreeTextExtractionInput): Promise<string | null> {
  const {
    sessionId,
    session,
    sanitizedMessage,
    quickReplyToken,
    turnCount,
    locale,
    recentMessages,
    conflictDimension,
    conflictClarified,
    pipe,
  } = input;

  let rawExtractionResponse: string | null = null;

  // Path A: Conflict clarification response
  if (conflictDimension && !conflictClarified) {
    const clarifiedValue = parseClarificationResponse(
      sanitizedMessage,
      conflictDimension as ConflictDimension,
      pipe.scoringState.kontakSerupa,
    );

    // Resolve: user gave clear answer, or chips wins (spec section 3.6)
    const resolvedValue = clarifiedValue ?? pipe.scoringState.kontakSerupa;
    if (conflictDimension === 'kontak') {
      pipe.scoringState = { ...pipe.scoringState, kontakSerupa: resolvedValue };
    }

    await prisma.screeningSession.update({
      where: { id: sessionId },
      data: {
        conflictClarified: true,
        conflictDimension: null,
        kontakSerupa: pipe.scoringState.kontakSerupa,
      },
    });

    await logAudit(sessionId, 'conflict_resolved', {
      dimension: conflictDimension,
      clarifiedValue,
      finalValue: resolvedValue,
      chipsWon: clarifiedValue === null,
      turn: turnCount,
    });

    pipe.extractionSucceeded = true;
    return null;
  }

  // Path B: Quick-reply bypass
  if (quickReplyToken) {
    pipe.extractionSucceeded = true;
    return null;
  }

  // Path C: Short answer validation (R3)
  const lastBotMsg = recentMessages.filter((m) => m.role === 'assistant').pop()?.content ?? null;
  const shortAnswerResult = validateShortAnswer(sanitizedMessage, pipe.dimensiBelum, lastBotMsg);

  if (shortAnswerResult) {
    pipe.extractionSucceeded = true;
    pipe.dimensiTerisi = {
      ...pipe.dimensiTerisi,
      [shortAnswerResult.dimension]: {
        keywords: shortAnswerResult.keywords,
        negasi: shortAnswerResult.negasi,
      },
    };
    pipe.dimensiBelum = pipe.dimensiBelum.filter((d) => d !== shortAnswerResult.dimension);

    // Derive gatalMalam from updated keywords (waktu/intensitas might have been filled)
    const derivedGatalMalam = deriveGatalMalam(pipe.dimensiTerisi, locale);
    if (derivedGatalMalam !== null) {
      pipe.scoringState = { ...pipe.scoringState, gatalMalam: derivedGatalMalam };
    }

    await logAudit(sessionId, 'short_answer_resolved', {
      dimension: shortAnswerResult.dimension,
      isAffirmative: shortAnswerResult.isAffirmative,
      turn: turnCount,
    });
    return null;
  }

  // Path D: Full LLM extraction
  const extractResult = await attemptExtraction(
    {
      phase: session.phase as SessionPhase,
      dimensiTerisi: pipe.dimensiTerisi,
      dimensiBelum: pipe.dimensiBelum,
      turnCount,
      locale,
      shouldNudge: shouldNudge({
        phase: session.phase as SessionPhase,
        dimensiBelum: pipe.dimensiBelum,
        perception: session.perception,
        hasilDitampilkan: session.hasilDitampilkan,
        crisisDetected: false,
        turnCount,
        partial: session.partial,
        chipsAnswered: pipe.chipsAnswered,
        stagnationCount: pipe.stagnationCount,
      }),
      scoringState: pipe.scoringState,
      chipsSubState: 'FREE_TEXT',
      toneTheme: ((session.toneTheme as string) || 'hybrid') as ToneTheme,
      perception: session.perception,
    },
    recentMessages,
    (raw) => {
      rawExtractionResponse = raw;
    },
  );

  if (extractResult) {
    pipe.extractionSucceeded = true;

    // Update gatalMalam deterministically from waktu keywords
    // Single source of truth — LLM no longer outputs gatalMalam
    const derivedGatalMalam = deriveGatalMalam(pipe.dimensiTerisi, locale);
    if (derivedGatalMalam !== null) {
      pipe.scoringState = { ...pipe.scoringState, gatalMalam: derivedGatalMalam };
    }

    // Validate extraction
    const validationResult = validateExtraction(extractResult.dimensi, locale);

    // Snapshot before merge (to detect which dims are newly filled this turn)
    const previousDimensiBelumForExtraction = [...pipe.dimensiBelum];

    // Separate chips-exclusive signals from regular extraction results
    const regularValid: Record<string, { keywords: string[]; negasi: string[] }> = {};
    const chipsSignals: string[] = [];

    for (const [dim, data] of Object.entries(validationResult.valid)) {
      if (CHIPS_EXCLUSIVE_DIMENSIONS.includes(dim)) {
        // Signal only — don't merge into coverage, just track for chips trigger
        if (data.keywords.length > 0 || data.negasi.length > 0) {
          chipsSignals.push(dim);
        }
      } else {
        regularValid[dim] = data;
      }
    }

    // Merge coverage — only non-chips-exclusive dimensions
    const mergedState = mergeCoverage(
      { dimensiTerisi: pipe.dimensiTerisi, dimensiBelum: pipe.dimensiBelum },
      { dimensi: regularValid },
    );
    pipe.dimensiTerisi = mergedState.dimensiTerisi;
    pipe.dimensiBelum = mergedState.dimensiBelum;

    // Store chips signals for trigger logic (used later in chips trigger step)
    if (chipsSignals.length > 0) {
      pipe.chipsSignals = chipsSignals;
    }

    // Apply corrections
    if (extractResult.koreksi.length > 0) {
      const corrections = extractResult.koreksi.map((k) => ({
        dimensi: k.dimensi,
        keywordDibatalkan: k.keyword_dibatalkan,
        keywordPengganti: k.keyword_pengganti,
      }));

      const correctionResult = applyCorrections(
        { dimensiTerisi: pipe.dimensiTerisi, dimensiBelum: pipe.dimensiBelum },
        corrections,
      );
      pipe.dimensiTerisi = correctionResult.state.dimensiTerisi;
      pipe.dimensiBelum = correctionResult.state.dimensiBelum;
      pipe.correctionChanged = correctionResult.changed;
    }

    // Rescore if corrections changed
    if (pipe.correctionChanged) {
      await handleRescore(sessionId, pipe.dimensiTerisi, locale);
    }

    // Upsert unmapped phrases
    if (validationResult.dropped.length > 0) {
      await upsertUnmappedPhrases(validationResult.dropped);
    }

    // Save TurnExtraction — include which dimensions were newly filled this turn
    const newlyFilled = previousDimensiBelumForExtraction.filter(
      (d) => !pipe.dimensiBelum.includes(d),
    );
    await prisma.turnExtraction.create({
      data: {
        sessionId,
        turnNumber: turnCount,
        extraction: extractResult as unknown as Prisma.InputJsonValue,
        scores: { newlyFilled, chipsSignals } as unknown as Prisma.InputJsonValue,
      },
    });

    // Post-extraction conflict detection against chips answers
    if (pipe.chipsAnswered.length > 0) {
      const conflictFlag = detectDimensionConflict(
        pipe.chipsAnswered,
        pipe.scoringState,
        extractResult.dimensi as { kontak?: { keywords: string[]; negasi: string[] } },
      );

      if (conflictFlag && !conflictClarified) {
        pipe.conflictClarificationSent = true;
        await prisma.screeningSession.update({
          where: { id: sessionId },
          data: {
            conflictDimension: conflictFlag.dimension,
            conflictClarified: false,
          },
        });

        await logAudit(sessionId, 'conflict_detected', {
          dimension: conflictFlag.dimension,
          chipsValue: conflictFlag.chipsValue,
          extractedValue: conflictFlag.extractedValue,
          turn: turnCount,
        });
      }
    }
  } else {
    // Extract failed - log and continue without extraction (Req 7.1)
    await logAudit(sessionId, 'llm_extract_failed', { turn: turnCount });
  }

  return rawExtractionResponse;
}

// ---------------------------------------------------------------------------
// Lock acquisition
// ---------------------------------------------------------------------------

/**
 * Optimistic lock: check processing state + TTL, acquire lock.
 * Throws 409 SessionBusyError if locked.
 */
async function acquireLock(sessionId: string): Promise<SessionLock> {
  const ttlThreshold = new Date(Date.now() - LOCK_TTL * 1000);

  const result = await prisma.screeningSession.updateMany({
    where: {
      id: sessionId,
      OR: [{ processing: false }, { processingStartedAt: { lt: ttlThreshold } }],
    },
    data: {
      processing: true,
      processingStartedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new SessionBusyError();
  }

  const session = await prisma.screeningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      locale: true,
      phase: true,
      turnCount: true,
      dimensiTerisi: true,
      dimensiBelum: true,
      hasilDitampilkan: true,
      partial: true,
      perception: true,
      chipsAnswered: true,
      chipsSubState: true,
      toneTheme: true,
      gatalMalam: true,
      kontakSerupa: true,
      lokasiKhas: true,
      asrama: true,
      tukarAlat: true,
      lastChipsTurn: true,
      conflictDimension: true,
      conflictClarified: true,
      stagnationCount: true,
      perceptionStartTurn: true,
      perceptionStep: true,
      // Drives the AWAITING_IMAGE gate in nextPhase(). `visualResult` is set both
      // on a successful prediction and on the permanent-failure fallback, so its
      // presence is exactly "the gate is satisfied".
      image: { select: { visualResult: true } },
    },
  });

  return session as unknown as SessionLock;
}

// ---------------------------------------------------------------------------
// Shared compose request helpers
// ---------------------------------------------------------------------------

/**
 * Guarantee at least one non-system message in the request.
 *
 * Gemini's OpenAI-compatible endpoint maps the message array onto
 * `GenerateContentRequest.contents` and rejects a system-only array with
 * `400 contents is not specified`, which would make every prompt-only compose
 * fail silently into a static template.
 */
function ensureUserTurn(messages: LLMMessage[], locale: Locale): LLMMessage[] {
  if (messages.some((m) => m.role !== 'system')) return messages;
  return [...messages, { role: 'user', content: COMPOSE_KICKOFF_MESSAGE[locale] }];
}

/**
 * Token budget for a compose attempt. A retry gets extra headroom because a
 * truncated reply means the model's thinking budget consumed the cap before it
 * finished the visible text.
 */
function composeTokenBudget(config: { maxTokensChat: number }, attempt: number): number {
  if (attempt === 0) return config.maxTokensChat;
  return Math.min(config.maxTokensChat * LLM_RETRY_TOKEN_MULTIPLIER, LLM_MAX_TOKENS_CEILING);
}

/**
 * Generation params shared by every compose call.
 *
 * `reasoning_effort` is only included when configured: reasoning models spend
 * output tokens on thinking, and omitting the key keeps non-reasoning providers
 * (Groq llama, Ollama) from rejecting the request.
 */
function composeParams(
  config: ReturnType<typeof getLLMConfig>,
  attempt: number,
): {
  temperature: number;
  max_tokens: number;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
} {
  return {
    temperature: config.temperatureChat,
    max_tokens: composeTokenBudget(config, attempt),
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
  };
}

// ---------------------------------------------------------------------------
// Compose with custom prompt
// ---------------------------------------------------------------------------

/**
 * Compose with a custom system prompt (no chat history needed).
 * Returns the full reply text on success, or null on failure.
 *
 * Non-streaming: these prompts produce short responses (1-2 sentences), and
 * holding the whole reply lets us reject a truncated one before it is emitted.
 */
async function attemptComposeWithPrompt(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  systemPrompt: string,
  locale: Locale,
): Promise<string | null> {
  const client = getPrimaryClient();
  const config = getLLMConfig();
  const messages = ensureUserTurn([{ role: 'system', content: systemPrompt }], locale);

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.chat.completions.create(
        {
          model: config.model,
          messages,
          ...composeParams(config, attempt),
          stream: false,
        },
        { timeout: config.timeoutMs },
      );

      const choice = response.choices[0];
      const content = choice?.message?.content;

      // Provider hit the output cap — the reply ends mid-word. Retry with a
      // wider budget rather than emitting or persisting a half sentence.
      if (choice?.finish_reason === FINISH_REASON_TRUNCATED) {
        console.warn('[compose-prompt] truncated reply discarded', {
          attempt,
          maxTokens: composeTokenBudget(config, attempt),
          usage: response.usage,
        });
        continue;
      }

      if (!content) return null;

      // Leaked planning text — retry rather than showing it, since the reply is
      // otherwise complete and a second attempt usually comes back clean.
      if (isLeakedReply(content)) {
        console.warn('[compose-prompt] leaked reply discarded', { attempt, reply: content });
        continue;
      }

      emitSSE(controller, encoder, { type: 'token', data: content });
      return content;
    } catch (err) {
      console.error('[compose-prompt] request failed', err instanceof Error ? err.message : err);
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Crisis handling
// ---------------------------------------------------------------------------

async function handleCrisisDetected(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  session: { id: string },
  sanitizedMessage: string,
  isVoice: boolean,
  crisisResponse: string | undefined,
  locale: Locale,
): Promise<void> {
  const responseText = crisisResponse ?? getBotText(locale).crisis.high;

  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: sanitizedMessage, isVoice },
    }),
    prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: responseText, isVoice: false },
    }),
    prisma.screeningSession.update({
      where: { id: session.id },
      data: {
        phase: 'CLOSED',
        status: 'COMPLETED',
        completedAt: new Date(),
        processing: false,
      },
    }),
  ]);

  await logAudit(session.id, 'crisis_detected', { message: sanitizedMessage });

  emitSSE(controller, encoder, { type: 'phase', data: 'CLOSED' });
  emitSSE(controller, encoder, { type: 'token', data: responseText });
  emitSSE(controller, encoder, { type: 'done', data: { turnCount: 0 } });
}

// ---------------------------------------------------------------------------
// LLM Extract
// ---------------------------------------------------------------------------

/** Correction note appended when the previous extraction JSON was unusable. */
const EXTRACTION_RETRY_NOTE: Record<Locale, string> = {
  id: 'Output JSON sebelumnya INVALID. Error: {error}. Perbaiki dan kirim ulang JSON yang valid sesuai schema.',
  en: 'The previous JSON output was INVALID. Error: {error}. Fix it and resend valid JSON matching the schema.',
};

/**
 * Attempt LLM extraction with one retry on Zod validation failure.
 * Returns parsed extraction or null on failure.
 */
async function attemptExtraction(
  state: InstructionContext,
  recentMessages: ChatMessage[],
  onRawResponse?: (raw: string) => void,
): Promise<RawExtraction | null> {
  const client = getPrimaryClient();
  const config = getLLMConfig();
  const baseMessages = buildExtractMessages(state, recentMessages);

  let lastZodError: string | null = null;

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt++) {
    try {
      // On retry after Zod failure: inject error context so LLM can self-correct
      const messages =
        attempt === 1 && lastZodError
          ? [
              ...baseMessages,
              {
                role: 'user' as const,
                content: EXTRACTION_RETRY_NOTE[state.locale].replace('{error}', lastZodError),
              },
            ]
          : baseMessages;

      // Same budget arithmetic as compose: on a thinking model the output cap
      // is shared with reasoning tokens, and a truncated response here is
      // unparseable JSON rather than a half sentence.
      const maxTokens =
        attempt === 0
          ? config.maxTokensOutput
          : Math.min(config.maxTokensOutput * LLM_RETRY_TOKEN_MULTIPLIER, LLM_MAX_TOKENS_CEILING);

      const response = await client.chat.completions.create(
        {
          model: config.model,
          messages,
          temperature: attempt === 0 ? 0 : 0.1,
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
        },
        { timeout: config.timeoutMs },
      );

      const choice = response.choices[0];
      const content = choice?.message?.content;

      if (choice?.finish_reason === FINISH_REASON_TRUNCATED) {
        console.warn('[extract] truncated response discarded', { attempt, maxTokens });
        lastZodError = 'output terpotong sebelum JSON selesai';
        continue;
      }

      if (!content) return null;

      onRawResponse?.(content);

      const result = parseExtraction(content);
      if (result.success) return result.data;

      // Zod validation failed — store error for retry context
      lastZodError = result.error;
      if (attempt === 0) continue;
      return null;
    } catch (err) {
      if (attempt === 0) continue;
      // Log error type for observability
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 429
      ) {
        console.error('[LLM] Rate limit exceeded (429)');
      }
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// LLM Compose (streaming)
// ---------------------------------------------------------------------------

/** Long-response phases are requested as a provider stream. */
const STREAMING_PHASES: readonly SessionPhase[] = ['SCREENING_COMPLETE', 'FOLLOW_UP'];

/** Outcome of one compose attempt, before any SSE emission. */
interface ComposeAttemptResult {
  reply: string | null;
  truncated: boolean;
}

/**
 * Run one compose request and return the complete reply.
 *
 * Both the streaming and non-streaming paths resolve the whole reply before it
 * is handed back, so the caller can reject a truncated one. Streaming is still
 * used for long phases to keep the provider connection progressing, but the
 * tokens are assembled here: the client accumulates `token` events and only
 * renders the bubble on `done`, so emitting per-delta buys no visible latency.
 */
async function runComposeAttempt(
  client: ReturnType<typeof getPrimaryClient>,
  config: ReturnType<typeof getLLMConfig>,
  messages: LLMMessage[],
  useStreaming: boolean,
  attempt: number,
): Promise<ComposeAttemptResult> {
  const params = {
    model: config.model,
    messages,
    ...composeParams(config, attempt),
  };

  if (!useStreaming) {
    const response = await client.chat.completions.create(
      { ...params, stream: false },
      { timeout: config.timeoutMs },
    );
    const choice = response.choices[0];
    return {
      reply: choice?.message?.content ?? null,
      truncated: choice?.finish_reason === FINISH_REASON_TRUNCATED,
    };
  }

  const stream = await client.chat.completions.create(
    { ...params, stream: true },
    { timeout: config.timeoutMs },
  );

  let reply = '';
  let truncated = false;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    reply += choice?.delta?.content ?? '';
    if (choice?.finish_reason === FINISH_REASON_TRUNCATED) truncated = true;
  }

  return { reply: reply || null, truncated };
}

/**
 * Attempt LLM compose for the given phase.
 * Returns the full reply text on success, or null on failure.
 *
 * A reply cut off at the provider's output-token cap is never emitted or
 * persisted — it is retried once with a wider budget, then left to the caller's
 * static template fallback.
 */
async function attemptCompose(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  phase: SessionPhase,
  state: InstructionContext,
  recentMessages: ChatMessage[],
): Promise<string | null> {
  const client = getPrimaryClient();
  const config = getLLMConfig();
  const messages = ensureUserTurn(buildComposeMessages(phase, state, recentMessages), state.locale);
  const useStreaming = STREAMING_PHASES.includes(phase);

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt++) {
    try {
      const { reply, truncated } = await runComposeAttempt(
        client,
        config,
        messages,
        useStreaming,
        attempt,
      );

      // Provider hit the output cap — the reply ends mid-word. Discard it and
      // retry with a wider budget instead of showing a half sentence.
      if (truncated) {
        console.warn('[compose] truncated reply discarded', {
          phase,
          attempt,
          maxTokens: composeTokenBudget(config, attempt),
          replyLength: reply?.length ?? 0,
        });
        continue;
      }

      if (!reply) return null;

      // Leaked planning text — retry rather than showing it, since the reply is
      // otherwise complete and a second attempt usually comes back clean.
      if (isLeakedReply(reply)) {
        console.warn('[compose] leaked reply discarded', { phase, attempt, reply });
        continue;
      }

      emitSSE(controller, encoder, { type: 'token', data: reply });
      return reply;
    } catch (err) {
      console.error('[compose] request failed', {
        phase,
        attempt,
        error: err instanceof Error ? err.message : err,
      });
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Message loading
// ---------------------------------------------------------------------------

async function loadRecentMessages(sessionId: string): Promise<ChatMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { role: true, content: true },
  });

  return messages.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

// ---------------------------------------------------------------------------
// TurnLog persistence
// ---------------------------------------------------------------------------

interface TurnLogInput {
  sessionId: string;
  turnCount: number;
  sanitizedMessage: string;
  rawExtractionResponse: string | null;
  pipe: PipelineState;
  newPhase: SessionPhase;
  recentMessages: ChatMessage[];
  locale: 'id' | 'en';
  snapshot: Record<string, unknown>;
  botReply: string;
}

async function saveTurnLog(input: TurnLogInput): Promise<void> {
  const {
    sessionId,
    turnCount,
    sanitizedMessage,
    rawExtractionResponse,
    pipe,
    newPhase,
    recentMessages,
    locale,
    snapshot,
  } = input;

  try {
    const instructionCtx = {
      phase: newPhase,
      dimensiTerisi: pipe.dimensiTerisi,
      dimensiBelum: pipe.dimensiBelum,
      turnCount,
      locale,
      shouldNudge: shouldNudge(snapshot as unknown as Parameters<typeof shouldNudge>[0]),
      scoringState: pipe.scoringState,
      chipsSubState: 'FREE_TEXT' as const,
      toneTheme: 'hybrid' as const,
      perception: (snapshot.perception as string | null) ?? null,
    };

    const extractMessages = buildExtractMessages(instructionCtx, recentMessages);
    const composeMessages = buildComposeMessages(newPhase, instructionCtx, recentMessages);

    await prisma.turnLog.create({
      data: {
        sessionId,
        turnNumber: turnCount,
        userMessage: sanitizedMessage,
        rawResponse: JSON.stringify({
          extraction: rawExtractionResponse ? JSON.parse(rawExtractionResponse) : null,
          compose: {
            phase: newPhase,
            botReply: input.botReply,
            systemPrompt: composeMessages[0]?.content ?? null,
            chatHistory: composeMessages.slice(1).map((m) => ({
              role: m.role,
              content: (m.content as string)?.slice(0, 200),
            })),
          },
        }),
        parseStatus: pipe.extractionSucceeded ? 'SUCCESS' : 'FAILURE',
        parseError: pipe.extractionSucceeded ? null : 'extraction_skipped',
        systemMessage: extractMessages[0]?.content ?? '',
        model: getLLMConfig().model,
        promptVersion: 'v2.1',
        latencyMs: 0,
        tokenUsage: undefined,
        retryCount: 0,
      },
    });
  } catch {
    // Best effort - TurnLog failure should not break the pipeline
  }
}

// ---------------------------------------------------------------------------
// SSE Helpers
// ---------------------------------------------------------------------------

/**
 * Hold a turn back so a reply built from fixed copy does not arrive instantly.
 *
 * Used by the branches that skip the LLM — chips intros and the photo request.
 * The arithmetic lives in `lib/typing-pace.ts` because the client needs the same
 * rhythm for the rows an image submission returns.
 */
function typingDelay(text?: string): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, typingDelayMs(text)));
}

function emitSSE(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: SSEEvent,
): void {
  controller.enqueue(encoder.encode(formatSSE(event)));
}

function emitQuickReplies(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  phase: SessionPhase,
): void {
  // No quick-reply chips — SCREENING_COMPLETE triggers finished state directly
  void controller;
  void encoder;
  void phase;
}

// ---------------------------------------------------------------------------
// Re-scoring
// ---------------------------------------------------------------------------

async function handleRescore(
  sessionId: string,
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>,
  locale: Locale,
): Promise<void> {
  const existingResult = await prisma.screeningResult.findUnique({
    where: { sessionId },
  });

  if (!existingResult) return;

  // Recompute scoring state from coverage
  const newState: ScoringState = {
    gatalMalam: existingResult.scoringState
      ? ((existingResult.scoringState as Record<string, unknown>).gatalMalam as boolean)
      : false,
    kontakSerupa: (dimensiTerisi['kontak']?.keywords?.length ?? 0) > 0,
    lokasiKhas: (dimensiTerisi['lokasi_tubuh']?.keywords?.length ?? 0) > 0,
    asrama: deriveAsrama(dimensiTerisi, locale),
    tukarAlat: deriveTukarAlat(dimensiTerisi, locale),
  };

  const riskResult = calculateRisk(newState);

  // Update existing result
  await prisma.screeningResult.update({
    where: { sessionId },
    data: {
      riskLevel: riskResult.riskLevel,
      gejalaCount: riskResult.gejalaCount,
      faktorCount: riskResult.faktorCount,
      scoringState: newState as unknown as Prisma.InputJsonValue,
    },
  });

  await logAudit(sessionId, 'rescore', {
    previousRisk: existingResult.riskLevel,
    newRisk: riskResult.riskLevel,
  });
}

// ---------------------------------------------------------------------------
// Unmapped phrases
// ---------------------------------------------------------------------------

async function upsertUnmappedPhrases(phrases: string[]): Promise<void> {
  for (const phrase of phrases) {
    try {
      await prisma.unmappedPhrase.upsert({
        where: { phrase },
        update: { frequency: { increment: 1 } },
        create: { phrase, frequency: 1 },
      });
    } catch {
      // Best effort
    }
  }
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logAudit(
  sessionId: string,
  event: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        sessionId,
        event,
        detail: detail as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Best effort - audit logging should not break the pipeline
  }
}

// ---------------------------------------------------------------------------
// Perception detection from user message
// ---------------------------------------------------------------------------

/**
 * Detect perception value from user's free-text response.
 * Maps common Indonesian expressions to perception categories.
 */
function _detectPerception(message: string): Perception | null {
  const normalized = message.toLowerCase().trim();

  // Barrier indicators (takut/malu/biaya/ragu)
  if (/malu|takut|mahal|biaya|ga berani|males|ragu/.test(normalized)) {
    return 'BARRIER';
  }

  // Overestimate (terlalu khawatir)
  if (/khawatir|panik|takut.*parah|bahaya|serius|mengkhawatirkan/.test(normalized)) {
    return 'OVERESTIMATE';
  }

  // Underestimate (meremehkan)
  if (/biasa aja|ringan|ga.*parah|bisa ditahan|santai|ga.*masalah/.test(normalized)) {
    return 'UNDERESTIMATE';
  }

  // Adequate (realistis / confirms it's bothersome)
  if (
    /mengganggu|ganggu|perlu.*periksa|mau.*periksa|lumayan|benar|betul|iya|ya|bener/.test(
      normalized,
    )
  ) {
    return 'ADEQUATE';
  }

  return null;
}

/**
 * Detect if user is asking for clarification rather than answering a question.
 * e.g., "maksudnya?", "apa itu?", "hah?", "gimana?", "ga ngerti"
 */
function _isClarificationRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  // Match: "maksudnya?", "apa itu?", "hah?", "gimana?", "ga ngerti", "gatalnya apa?", etc.
  return /^(maksud(nya)?|apa (itu|maksud|arti)|hah|gimana|ga (ngerti|paham)|kurang (ngerti|paham)|nggak (ngerti|paham)|bingung|.{0,15}(apa|gimana|maksud)\??)[?.]?$/.test(
    normalized,
  );
}
/**
 * System prompt for the ambiguous-answer classifier, per locale.
 *
 * Split into a shared base plus a per-step suffix so the model is told which of
 * the two questions the answer belongs to. Without that, short answers are
 * ambiguous by construction: "biasa aja" is a severity on one turn and a denial
 * on the other.
 */
const PERCEPTION_CLASSIFIER_PROMPT: Record<
  Locale,
  { base: string; severityAsked: string; barrierAsked: string }
> = {
  id: {
    base: `Klasifikasikan jawaban user tentang persepsi keluhannya. Output JSON saja.

Rules:
- Jika user menyebut tingkat keparahan → set severity (low/moderate/high)
- Jika user menyebut hambatan → set barrier ke jenis hambatannya
- Jika user bilang tidak ada hambatan → set noBarrier: true
- Typo/slang tetap dipahami (misal "menggnaggu" = mengganggu = moderate)
- Angka: 1=low, 2=moderate, 3=high

Output HARUS: {"severity": "low"|"moderate"|"high"|null, "barrier": "malu"|"takut"|"biaya"|"ribet"|null, "noBarrier": true|false}`,
    severityAsked: `PERTANYAAN YANG BARU DITANYAKAN: "menurut kamu keluhan ini (1) biasa aja, (2) cukup mengganggu, atau (3) bikin khawatir?"
Jadi jawaban user kemungkinan besar adalah severity. JANGAN set noBarrier di sini — hambatan belum ditanyakan. Kalau user cuma bilang siap/lanjut/oke tanpa menyebut tingkat keparahan, kembalikan semua null.`,
    barrierAsked: `PERTANYAAN YANG BARU DITANYAKAN: "ada ga hal yang bikin kamu ragu atau males buat periksa ke kader/dokter?"
Jadi jawaban user adalah tentang hambatan, bukan tingkat keparahan. JANGAN set severity di sini.`,
  },
  en: {
    base: `Classify the user's answer about how they perceive their complaint. Output JSON only.

Rules:
- If the user names a severity level → set severity (low/moderate/high)
- If the user names a barrier → set barrier to that barrier type
- If the user says there is no barrier → set noBarrier: true
- Understand typos and slang (e.g. "botherng" = bothersome = moderate)
- Numbers: 1=low, 2=moderate, 3=high
- The barrier values stay in Indonesian: they are enum codes, not display text.

Output MUST be: {"severity": "low"|"moderate"|"high"|null, "barrier": "malu"|"takut"|"biaya"|"ribet"|null, "noBarrier": true|false}`,
    severityAsked: `THE QUESTION JUST ASKED WAS: "how would you describe this — (1) no big deal, (2) fairly bothersome, or (3) really worrying?"
So the answer is most likely a severity. Do NOT set noBarrier here — barriers have not been asked about yet. If the user only says ready/ok/go without naming a severity, return all nulls.`,
    barrierAsked: `THE QUESTION JUST ASKED WAS: "is anything holding you back from getting checked by a health cadre or doctor?"
So the answer is about barriers, not severity. Do NOT set severity here.`,
  },
};

/**
 * Classify a perception answer against the question that was actually asked.
 *
 * `askedStep` is not a hint, it is a constraint. A denial only means "no
 * barrier" if the barrier question was the one on the table; read out of
 * context, ordinary continuation words ("siap", "langsung aja", "oke") look
 * exactly like one. Volunteered barriers are the exception and count at either
 * step, because naming a barrier unprompted is real signal rather than an
 * ambiguous shape.
 */
async function classifyPerceptionAnswer(
  message: string,
  askedStep: PerceptionStep,
  locale: Locale,
): Promise<{
  severity: 'low' | 'moderate' | 'high' | null;
  barrier: string | null;
  noBarrier: boolean;
}> {
  const normalized = message.toLowerCase().trim();
  const barrierWasAsked = askedStep === 'ASK_BARRIER';

  // --- Fast path: regex for common/clear answers ---

  // Patterns cover both languages regardless of session locale: users answer
  // "no"/"embarrassed" on Indonesian sessions and vice versa.

  // Barrier (conclusive — highest priority)
  if (
    /malu|takut|mahal|biaya|ga berani|males|ragu|ribet|segan|sungkan|embarrass|ashamed|shy|scared|afraid|afford|expensive|cost|hassle|hesitant|too much trouble/.test(
      normalized,
    )
  ) {
    return { severity: null, barrier: 'barrier', noBarrier: false };
  }

  // No barrier (explicit denial) — broad matching, and only meaningful as an
  // answer to the barrier question.
  if (barrierWasAsked && isNoBarrierAnswer(normalized)) {
    return { severity: null, barrier: null, noBarrier: true };
  }

  // Severity, and only as an answer to the severity question. Read against the
  // barrier question these patterns misfire in the mirror-image way a denial
  // does: "biasa aja" means "nothing in particular" there, not "mild".
  if (!barrierWasAsked) {
    // Number shorthand (tolerant: handles "1", "1.", "(1)", "pilih 1", etc.)
    if (
      /^\(?1\)?\.?$|^satu$|^one$|^\(?1\)?\.?\s|pilih\s*1|nomor\s*1|opsi\s*1|option\s*1/.test(
        normalized,
      )
    )
      return { severity: 'low', barrier: null, noBarrier: false };
    if (
      /^\(?2\)?\.?$|^dua$|^two$|^\(?2\)?\.?\s|pilih\s*2|nomor\s*2|opsi\s*2|option\s*2/.test(
        normalized,
      )
    )
      return { severity: 'moderate', barrier: null, noBarrier: false };
    if (
      /^\(?3\)?\.?$|^tiga$|^three$|^\(?3\)?\.?\s|pilih\s*3|nomor\s*3|opsi\s*3|option\s*3/.test(
        normalized,
      )
    )
      return { severity: 'high', barrier: null, noBarrier: false };

    // Keyword match
    if (
      /biasa|ringan|ga.*parah|santai|ga.*masalah|mild|no big deal|not.*bad|fine|minor|slight/.test(
        normalized,
      )
    ) {
      return { severity: 'low', barrier: null, noBarrier: false };
    }
    if (
      /mengganggu|ganggu|lumayan|cukup|bother|annoying|disrupt|fairly|somewhat/.test(normalized)
    ) {
      return { severity: 'moderate', barrier: null, noBarrier: false };
    }
    if (
      /khawatir|parah|serius|banget|panik|worr|severe|serious|really bad|panic|scary/.test(
        normalized,
      )
    ) {
      return { severity: 'high', barrier: null, noBarrier: false };
    }
  }

  // --- Slow path: LLM for ambiguous/typo cases ---

  const client = getPrimaryClient();
  const config = getLLMConfig();
  const copy = PERCEPTION_CLASSIFIER_PROMPT[locale];
  const systemPrompt = `${copy.base}\n\n${barrierWasAsked ? copy.barrierAsked : copy.severityAsked}`;

  try {
    const response = await client.chat.completions.create(
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 60,
      },
      { timeout: 8000 },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return { severity: null, barrier: null, noBarrier: false };

    const parsed = JSON.parse(content);

    // The prompt states which question was asked, but the answer is still
    // discarded per step rather than trusted: a model that volunteers a
    // `noBarrier` on the severity turn would resolve perception against a
    // question the santri never saw, which is the failure this whole step
    // parameter exists to prevent.
    return {
      severity: barrierWasAsked ? null : (parsed.severity ?? null),
      barrier: parsed.barrier ?? null,
      noBarrier: barrierWasAsked && parsed.noBarrier === true,
    };
  } catch {
    // LLM failed. On the barrier turn, silence about barriers is itself an
    // answer: someone who names no barrier has none. On the severity turn there
    // is nothing to infer, so the compose layer re-asks instead.
    if (
      barrierWasAsked &&
      !/malu|takut|mahal|biaya|ragu|males|ribet|segan|embarrass|ashamed|scared|afraid|cost|expensive|hassle|hesitant/.test(
        normalized,
      )
    ) {
      return { severity: null, barrier: null, noBarrier: true };
    }
    return { severity: null, barrier: null, noBarrier: false };
  }
}

/**
 * Check if message is a "no barrier" answer.
 * Broad matching — handles many Indonesian and English denial variations.
 *
 * Only valid to call once the barrier question has been asked. The readiness
 * forms below ("langsung aja", "siap") do mean "nothing is stopping me" in reply
 * to that question, and mean nothing of the sort anywhere else — callers must
 * establish the context, the patterns cannot.
 */
function isNoBarrierAnswer(normalized: string): boolean {
  // Direct denial patterns
  if (/^(ga|gak|nggak|tidak|engga|ndak|kagak|kaga|ngga)\b/.test(normalized)) return true;
  if (/^(no|nope|nah|none|nothing|negative)\b/.test(normalized)) return true;
  if (/(no|nothing)\s*(at all|really|much)?$/.test(normalized)) return true;
  if (/there('s| is| are)?\s*(no|nothing|none)/.test(normalized)) return true;
  // "ga ada" variants with optional suffix
  if (/ga(k)?\s*ada/.test(normalized)) return true;
  if (/nggak\s*ada/.test(normalized)) return true;
  if (/tidak\s*ada/.test(normalized)) return true;
  // Common casual forms
  if (/^(gapapa|gpp|gaada|gada|nope|ngga|kaga|enggak)/.test(normalized)) return true;
  // "nothing" / "none" patterns
  if (/ga(k)?\s*(ada\s*)?(alasan|hambatan|hal|masalah|kendala)/.test(normalized)) return true;
  if (/tidak\s*(ada\s*)?(alasan|hambatan|hal|masalah|kendala)/.test(normalized)) return true;
  // Positive-framed "no barrier": "langsung aja", "oke aja", "siap"
  if (/langsung|siap|oke aja|mau aja|bisa aja/.test(normalized)) return true;
  return false;
}

/** Locale-specific copy for the two perception prompts and their retry. */
const PERCEPTION_PROMPT_COPY: Record<
  Locale,
  {
    persona: string;
    dimLabels: Record<string, string>;
    nightItchLine: string;
    symptomsLabel: string;
    severityBody: string;
    severityRules: string;
    severityExample: string;
    barrierBody: (answer: string) => string;
    barrierRules: string;
    barrierExample: string;
    outputOnly: string;
    rulesHeading: string;
    retryBarrier: (answer: string) => string;
    retrySeverity: (answer: string) => string;
  }
> = {
  id: {
    persona:
      'Kamu adalah SICAPS, chatbot skrining kulit untuk santri pondok pesantren. Personality: teman curhat yang asyik & supportive.',
    dimLabels: {
      intensitas: 'Intensitas gatal',
      waktu: 'Waktu',
      lokasi_tubuh: 'Lokasi',
      kontak: 'Kontak',
      lesi: 'Lesi kulit',
      faktor_risiko: 'Faktor risiko',
    },
    nightItchLine: '- Gatal lebih parah malam hari',
    symptomsLabel: 'Gejala user',
    severityBody:
      'Info gejala sudah lengkap. Sekarang kamu perlu tanya SATU hal saja: menurut user, keluhan ini ringan, mengganggu, atau bikin khawatir.',
    severityRules: `1. Gunakan kata ganti "kamu" dan "aku". Bahasa gaul, playful, pakai 1-2 emoji.
2. Tanya HANYA satu pertanyaan: persepsi severity.
3. Berikan 3 pilihan yang jelas: (1) biasa aja/ringan, (2) cukup mengganggu, (3) bikin khawatir.
4. Maksimal 2 kalimat. Tanggapi singkat dulu, baru tanya.
5. JANGAN tanya soal hambatan periksa di pesan ini.
6. JANGAN sebut skor atau diagnosis. DILARANG pakai "Apakah".
7. WAJIB menjawab dalam Bahasa Indonesia.`,
    severityExample:
      'Contoh tone: "Oke aku udah catat semuanya 📝 Nah menurut kamu, keluhan ini (1) biasa aja, (2) cukup ganggu, atau (3) bikin khawatir banget?"',
    barrierBody: (answer) =>
      `User baru menjawab soal seberapa parah keluhannya: "${answer}"

Sekarang tanya SATU hal lagi: ada ga yang bikin user ragu atau males buat periksa ke kader/dokter.`,
    barrierRules: `1. Gunakan kata ganti "kamu" dan "aku". Bahasa gaul, playful, pakai 1-2 emoji.
2. Tanggapi SINGKAT (1 kalimat) jawaban severity mereka dengan empati.
3. Lalu tanya: ada ga hambatan buat periksa? Kasih contoh: malu, takut, ribet, biaya.
4. Maksimal 2 kalimat total.
5. Bilang "ga ada" juga boleh sebagai jawaban (supaya user tau bisa jawab negatif).
6. JANGAN sebut skor atau diagnosis. DILARANG pakai "Apakah".
7. WAJIB menjawab dalam Bahasa Indonesia.`,
    barrierExample:
      'Contoh tone: "Oke noted 👍 Terus ada ga sih yang bikin kamu ragu buat periksa? Misal malu, takut, atau ribet? Kalau ga ada juga gapapa ya~"',
    outputOnly: 'OUTPUT HANYA teks percakapan untuk user.',
    rulesHeading: '--- ATURAN ---',
    retryBarrier: (
      answer,
    ) => `User menjawab "${answer}" untuk pertanyaan: "ada ga hambatan buat periksa ke dokter?"
Apakah jawaban ini berarti (a) ada hambatan, atau (b) tidak ada hambatan?
Output JSON: {"barrier": "malu"|"takut"|"biaya"|"ribet"|null, "noBarrier": true|false}`,
    retrySeverity: (
      answer,
    ) => `User menjawab "${answer}" untuk pertanyaan: "menurut kamu keluhan ini ringan, mengganggu, atau khawatir?"
Klasifikasikan: 1/ringan=low, 2/mengganggu=moderate, 3/khawatir=high.
Output JSON: {"severity": "low"|"moderate"|"high"|null}`,
  },
  en: {
    persona:
      'You are SICAPS, a skin-screening chatbot for santri at Islamic boarding schools. Personality: a friendly, supportive companion to talk to.',
    dimLabels: {
      intensitas: 'Itch intensity',
      waktu: 'Timing',
      lokasi_tubuh: 'Location',
      kontak: 'Contact',
      lesi: 'Skin lesions',
      faktor_risiko: 'Risk factors',
    },
    nightItchLine: '- Itching is worse at night',
    symptomsLabel: 'User symptoms',
    severityBody:
      'The symptom information is complete. Now you need to ask just ONE thing: whether the user considers this complaint mild, bothersome, or worrying.',
    severityRules: `1. Use "you" and "I". Keep it casual and playful, with 1-2 emoji.
2. Ask ONLY one question: their perceived severity.
3. Give 3 clear options: (1) no big deal/mild, (2) fairly bothersome, (3) really worrying.
4. Maximum 2 sentences. Acknowledge briefly first, then ask.
5. Do NOT ask about barriers to getting checked in this message.
6. Do NOT mention any score or diagnosis. Avoid stiff, formal phrasing.
7. You MUST reply in English.`,
    severityExample:
      'Example tone: "Okay, I have noted everything 📝 So how would you describe this — (1) no big deal, (2) fairly bothersome, or (3) really worrying?"',
    barrierBody: (answer) =>
      `The user just answered how severe their complaint feels: "${answer}"

Now ask ONE more thing: whether anything makes them hesitant or reluctant to get checked by a health cadre/doctor.`,
    barrierRules: `1. Use "you" and "I". Keep it casual and playful, with 1-2 emoji.
2. Acknowledge their severity answer BRIEFLY (1 sentence) with empathy.
3. Then ask: is anything blocking you from getting checked? Give examples: embarrassment, fear, hassle, cost.
4. Maximum 2 sentences total.
5. Mention that "nothing" is a fine answer too (so the user knows they can answer negatively).
6. Do NOT mention any score or diagnosis. Avoid stiff, formal phrasing.
7. You MUST reply in English.`,
    barrierExample:
      'Example tone: "Noted 👍 So is there anything that makes you hesitant about getting checked? Maybe embarrassment, fear, or it feels like a hassle? Nothing is a fine answer too!"',
    outputOnly: 'OUTPUT ONLY the conversational text for the user.',
    rulesHeading: '--- RULES ---',
    retryBarrier: (
      answer,
    ) => `The user answered "${answer}" to the question: "is anything blocking you from getting checked by a doctor?"
Does this answer mean (a) there is a barrier, or (b) there is no barrier?
Output JSON: {"barrier": "malu"|"takut"|"biaya"|"ribet"|null, "noBarrier": true|false}`,
    retrySeverity: (
      answer,
    ) => `The user answered "${answer}" to the question: "do you think this complaint is mild, bothersome, or worrying?"
Classify: 1/mild=low, 2/bothersome=moderate, 3/worrying=high.
Output JSON: {"severity": "low"|"moderate"|"high"|null}`,
  },
};

/**
 * Build prompt for perception step 1: severity only.
 * Does NOT ask about barriers — that comes in step 2.
 */
function buildPerceptionSeverityPrompt(
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>,
  scoringState: ScoringState,
  locale: Locale,
): string {
  const copy = PERCEPTION_PROMPT_COPY[locale];
  const lines: string[] = [];

  for (const [dim, data] of Object.entries(dimensiTerisi)) {
    if (data.keywords.length > 0) {
      lines.push(`- ${copy.dimLabels[dim] ?? dim}: ${data.keywords.join(', ')}`);
    }
  }

  if (scoringState.gatalMalam) lines.push(copy.nightItchLine);

  return `${copy.persona}

${copy.symptomsLabel}:
${lines.join('\n')}

${copy.severityBody}

${copy.rulesHeading}
${copy.severityRules}

${copy.severityExample}

${copy.outputOnly}`;
}

/**
 * Build prompt for perception step 2: barrier follow-up.
 * Asked AFTER user answers severity, adapted to their answer.
 */
function buildBarrierFollowUpPrompt(userSeverityAnswer: string, locale: Locale): string {
  const copy = PERCEPTION_PROMPT_COPY[locale];

  return `${copy.persona}

${copy.barrierBody(userSeverityAnswer)}

${copy.rulesHeading}
${copy.barrierRules}

${copy.barrierExample}

${copy.outputOnly}`;
}

/**
 * Focused classification prompt used when regex could not read the perception
 * answer, so one more LLM attempt is made before defaulting.
 */
function buildPerceptionRetryPrompt(
  userAnswer: string,
  wasBarrierQuestion: boolean,
  locale: Locale,
): string {
  const copy = PERCEPTION_PROMPT_COPY[locale];
  return wasBarrierQuestion ? copy.retryBarrier(userAnswer) : copy.retrySeverity(userAnswer);
}

// ---------------------------------------------------------------------------
// Chips request builder
// ---------------------------------------------------------------------------

/**
 * Build the chips question payload sent to the client.
 *
 * Option tokens stay in Indonesian: they are the canonical values persisted and
 * scored server-side. Only the labels are localized.
 */
function buildChipsRequest(
  chipsType: ChipsType,
  locale: Locale,
): {
  id: string;
  type: 'single' | 'multi';
  question: string;
  options: Array<{ token: string; label: string }>;
  allowFreeText: boolean;
} {
  const { chipsLabels } = getBotText(locale);
  const id = `chips_${chipsType}_${Date.now()}`;

  switch (chipsType) {
    case 'kontak':
      return {
        id,
        type: 'single',
        question: '',
        options: [
          { token: 'true', label: chipsLabels.contactYes },
          { token: 'false', label: chipsLabels.contactNo },
        ],
        allowFreeText: false,
      };
    case 'lokasi':
      return {
        id,
        type: 'multi',
        question: '',
        options: [
          ...Object.entries(chipsLabels.bodyParts).map(([token, label]) => ({ token, label })),
          { token: 'Lainnya', label: chipsLabels.other },
        ],
        allowFreeText: true,
      };
    case 'asrama':
      return {
        id,
        type: 'single',
        question: '',
        options: [
          { token: 'true', label: chipsLabels.dormYes },
          { token: 'false', label: chipsLabels.dormNo },
        ],
        allowFreeText: false,
      };
    case 'tukar_alat':
      return {
        id,
        type: 'single',
        question: '',
        options: [
          { token: 'true', label: chipsLabels.sharingYes },
          { token: 'false', label: chipsLabels.sharingNo },
        ],
        allowFreeText: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Chips input parsing helpers
// ---------------------------------------------------------------------------

function parseActiveChipsType(chipsSubState: string): ChipsType | null {
  // Format: "CHIPS_ACTIVE:kontak" or "CHIPS_ACTIVE:lokasi" etc.
  const parts = chipsSubState.split(':');
  if (parts.length < 2) return null;
  const type = parts[1] as ChipsType;
  if (['kontak', 'lokasi', 'asrama', 'tukar_alat'].includes(type)) return type;
  return null;
}

function parseChipsInput(type: ChipsType, message: string): ChipsAnswer {
  const trimmed = message.trim();

  if (type === 'kontak' || type === 'asrama' || type === 'tukar_alat') {
    // Accept: token "true"/"false" (from updated frontend) OR text "ya"/"iya"/"benar" (legacy/free-text)
    const isTrue = trimmed === 'true' || /^(ya|iya|benar|ada|punya)$/i.test(trimmed);
    return { type, selections: [isTrue ? 'true' : 'false'] };
  }

  if (type === 'lokasi') {
    const selections = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { type, selections };
  }

  return { type, selections: [trimmed] };
}

// ---------------------------------------------------------------------------
// Chips input parsing helpers
// ---------------------------------------------------------------------------
