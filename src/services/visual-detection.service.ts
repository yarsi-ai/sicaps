/**
 * Visual Detection Service
 *
 * Orchestrates storage upload, the bounded prediction retry loop, persistence,
 * and result combination. The only layer permitted to import both lib/vision/*
 * and Prisma for this feature.
 *
 * Requirements: 2.2, 4.1, 4.3, 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 9.7, 10.1, 10.2,
 * 10.3, 10.4, 13.2
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/db/prisma';
import { AppError, NotFoundError } from '@/lib/errors';
import {
  combineFinalOutput,
  evaluateAttempts,
  type AttemptOutcome,
  type ChatbotRiskLevel,
  type FinalOutput,
  type VisionPredictionResult,
  type VisualResult,
} from '@/lib/vision';

import { advancePhaseAfterImage } from '@/features/screening-chat-v2';
import { getBotText, type Locale } from '@/features/screening-chat-v2/domain/chat/bot-text';
import type { SessionPhase } from '@/features/screening-chat-v2/domain/types';

import { isStorageConfigured, uploadScreeningImage } from './storage.service';
import { predictVisual } from './vision-api.service';

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/** Thrown when consent was not given for image upload. */
export class ConsentRequiredError extends AppError {
  constructor(message = 'Image consent is required') {
    super(message, 400, 'CONSENT_REQUIRED');
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubmitImageInput {
  sessionId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  consentGiven: boolean;
}

export interface SubmitImageResult {
  imageId: string;
  /**
   * The bot reply that was persisted for this submission, so the live chat can
   * show the same wording it will show after a refresh. The client renders this
   * verbatim rather than holding its own copy.
   */
  botMessage: string;
  /**
   * The question the next phase owes, when leaving the gate lands somewhere that
   * has one to ask. Null when the phase did not move or owes nothing.
   */
  followUpMessage: string | null;
  /** The phase the session is in after the upload. */
  phase: SessionPhase;
  /**
   * Always populated once submitImage resolves. On permanent prediction failure
   * this is the documented NEGATIVE fallback, flagged by predictionFailed.
   */
  visualResult: VisualResult;
  /** True when every attempt failed and the NEGATIVE fallback was applied. */
  predictionFailed: boolean;
  /**
   * Null only when the session has no ScreeningResult to combine against, which
   * cannot happen for a session that reached SCREENING_COMPLETE.
   */
  finalOutput: FinalOutput | null;
}

/**
 * Whether the image gate has resolved for a session, and what it resolved to.
 * Requirements: 2.2, 8.2
 */
export interface ImageGateStatus {
  /**
   * True once a visual result has been recorded — either a successful
   * prediction or the permanent-failure fallback. This is the single field the
   * UI needs to decide whether the result page is reachable.
   */
  resolved: boolean;
  visualResult: VisualResult | null;
  predictionFailed: boolean;
}

/** Outcome of the bounded retry loop against the external vision API. */
interface PredictionOutcome {
  visualResult: VisualResult;
  predictionFailed: boolean;
  attemptsUsed: number;
  confidence: number | null;
  rawResult: Prisma.InputJsonValue | undefined;
}

// ---------------------------------------------------------------------------
// Prediction Loop
// ---------------------------------------------------------------------------

/**
 * Call the external vision API once. Retries are driven by the client (user
 * taps the retry button), so a single server-side attempt is sufficient — it
 * avoids stalling the request for the full multi-attempt timeout.
 *
 * On failure the caller receives predictionFailed=true (NEGATIVE fallback) so
 * the gate can resolve if the client decides to skip after exhausting retries.
 *
 * Requirements: 7.1, 7.2, 7.3, 8.1
 */
async function runPrediction(fileBuffer: Buffer, mimeType: string): Promise<PredictionOutcome> {
  const outcomes: AttemptOutcome[] = [];
  let prediction: VisionPredictionResult | null = null;

  try {
    prediction = await predictVisual(fileBuffer, mimeType);
    outcomes.push({ success: true });
  } catch (error) {
    outcomes.push({ success: false });
    console.warn('[visual-detection] prediction attempt failed', {
      reason: error instanceof AppError ? error.code : 'UNKNOWN',
    });
  }

  const run = evaluateAttempts(outcomes);

  if (run.succeededAtAttempt === null || prediction === null) {
    return {
      visualResult: 'NEGATIVE',
      predictionFailed: true,
      attemptsUsed: run.attemptsUsed,
      confidence: null,
      rawResult: undefined,
    };
  }

  return {
    visualResult: prediction.result,
    predictionFailed: false,
    attemptsUsed: run.attemptsUsed,
    confidence: prediction.confidence ?? null,
    rawResult: prediction.rawResult as Prisma.InputJsonValue | undefined,
  };
}

/**
 * Record the photo as a turn in the durable transcript, followed by the bot's
 * verdict-free acknowledgement.
 *
 * Two rows, written together:
 *
 * 1. The image turn (`role: 'user'`, `kind: 'IMAGE'`). Its `content` holds
 *    readable text on purpose — `loadRecentMessages()` feeds `content` straight
 *    into the LLM context, and a reader that ignores `kind` degrades to a
 *    sensible sentence instead of an empty bubble.
 * 2. The bot's reply. It states whether the photo could be analysed and never
 *    the POSITIVE/NEGATIVE verdict: a NEGATIVE photo combined with a HIGH chat
 *    risk still yields SUSPECTED_SCABIES, so a bare verdict here would
 *    contradict the result page. The verdict stays on the result page
 *    (Requirement 11).
 *
 * A third row follows when leaving the gate puts the session in a phase that
 * owes a question — the upload is not a chat turn, so nothing else would ask it.
 *
 * `createdAt` is set explicitly. Inside a transaction Postgres' `now()` is the
 * transaction timestamp, so relying on the column default would give every row
 * the same instant and leave `orderBy: createdAt` free to shuffle them.
 */
async function recordImageTurn(
  sessionId: string,
  locale: Locale,
  predictionFailed: boolean,
  followUpMessage: string | null,
): Promise<string> {
  const text = getBotText(locale);
  const botMessage = predictionFailed ? text.imageAnalysisFailed : text.imageAnalysisDone;
  const now = Date.now();

  const rows = [
    prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'user',
        kind: 'IMAGE',
        content: text.imageSubmitted,
        isVoice: false,
        createdAt: new Date(now),
      },
    }),
    prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: botMessage,
        isVoice: false,
        createdAt: new Date(now + 1),
      },
    }),
  ];

  if (followUpMessage !== null) {
    rows.push(
      prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: followUpMessage,
          isVoice: false,
          createdAt: new Date(now + 2),
        },
      }),
    );
  }

  await prisma.$transaction(rows);

  return botMessage;
}

/**
 * Combine the visual result with the session's chat-derived risk level and
 * persist both onto ScreeningResult.
 *
 * Requirements: 9.7, 10.3
 */
async function persistFinalOutput(
  sessionId: string,
  visualResult: VisualResult,
  predictionFailed: boolean,
): Promise<FinalOutput | null> {
  const screeningResult = await prisma.screeningResult.findUnique({
    where: { sessionId },
    select: { id: true, riskLevel: true },
  });

  if (!screeningResult) {
    return null;
  }

  const finalOutput = combineFinalOutput(
    screeningResult.riskLevel as ChatbotRiskLevel,
    visualResult,
  );

  await prisma.screeningResult.update({
    where: { id: screeningResult.id },
    data: {
      visualResult,
      visualPredictionFailed: predictionFailed,
      finalOutput,
    },
  });

  return finalOutput;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Submit a screening image and resolve the image gate.
 *
 * 1. Validate consent and that the session exists.
 * 2. Return idempotently if this session already has a resolved image.
 * 3. Upload the buffer to Supabase Storage, if configured (storagePath stays
 *    null otherwise — analysis proceeds regardless).
 * 4. Create the ScreeningImage row.
 * 5. Run the bounded prediction retry loop.
 * 6. Persist the visual result and attempt metadata.
 * 7. Combine with the chat risk level and persist the final output.
 *
 * Requirements: 4.1, 4.3, 7.1, 8.1, 9.7, 10.1, 10.2, 10.4
 */
export async function submitImage(input: SubmitImageInput): Promise<SubmitImageResult> {
  const { sessionId, fileBuffer, fileName, mimeType, fileSize, consentGiven } = input;

  // Requirement 4.3 — consent is a precondition, not a stored preference.
  if (!consentGiven) {
    throw new ConsentRequiredError();
  }

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: { id: true, locale: true, phase: true },
  });

  if (!session) {
    throw new NotFoundError(`Session not found: ${sessionId}`);
  }

  const locale: Locale = session.locale === 'en' ? 'en' : 'id';

  // Requirement 10.4 / Error Scenario 4 — one image per session. A duplicate
  // submission replays the stored outcome instead of re-uploading and
  // re-billing the external API.
  const existing = await prisma.screeningImage.findUnique({
    where: { sessionId },
    select: { id: true, visualResult: true, predictionFailed: true },
  });

  if (existing?.visualResult) {
    const result = await prisma.screeningResult.findUnique({
      where: { sessionId },
      select: { finalOutput: true },
    });

    const text = getBotText(locale);

    return {
      imageId: existing.id,
      // Replayed, not re-persisted: the transcript already holds this reply from
      // the original submission, and so does any follow-up question it triggered.
      botMessage: existing.predictionFailed ? text.imageAnalysisFailed : text.imageAnalysisDone,
      followUpMessage: null,
      phase: session.phase as SessionPhase,
      visualResult: existing.visualResult,
      predictionFailed: existing.predictionFailed,
      finalOutput: result?.finalOutput ?? null,
    };
  }

  // A row without a visual result means a previous attempt died between the
  // insert and the prediction. Reuse it rather than orphaning a second upload.
  let imageId = existing?.id;

  if (imageId === undefined) {
    // Storage is optional: only the vision API is required to run v2. Without
    // SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, storagePath stays null and the
    // photo is analysed but not persisted — analysis and phase progression
    // must not depend on a storage bucket the deployment never configured.
    const storagePath = isStorageConfigured()
      ? (await uploadScreeningImage(sessionId, fileBuffer, mimeType)).storagePath
      : null;

    const created = await prisma.screeningImage.create({
      data: {
        sessionId,
        storagePath,
        fileName,
        mimeType,
        fileSize,
        consentGiven,
        attemptCount: 0,
      },
      select: { id: true },
    });

    imageId = created.id;
  }

  const outcome = await runPrediction(fileBuffer, mimeType);

  // Requirement 10.1 — persist the result, the attempt count, and the raw
  // upstream payload for later research use.
  await prisma.screeningImage.update({
    where: { id: imageId },
    data: {
      visualResult: outcome.visualResult,
      predictionFailed: outcome.predictionFailed,
      attemptCount: outcome.attemptsUsed,
      confidenceScore: outcome.confidence,
      ...(outcome.rawResult === undefined ? {} : { rawResult: outcome.rawResult }),
    },
  });

  const finalOutput = await persistFinalOutput(
    sessionId,
    outcome.visualResult,
    outcome.predictionFailed,
  );

  // Leaving AWAITING_IMAGE is driven from here, not from a chat turn, because an
  // upload is not a turn. The helper reuses the same state machine so the gate
  // cannot drift from the rest of the phase logic.
  //
  // When predictionFailed=true the botMessage ends with "Siap lanjut?", which
  // already asks the santri something. Stacking the perception question behind it
  // would put two questions in one turn, so the gate is told to hold that
  // question back — and, because it holds the question back, it also does not
  // record it as asked. chat.service opens the perception exchange on the next
  // turn instead.
  const { phase, followUpMessage } = await advancePhaseAfterImage(sessionId, {
    suppressFollowUp: outcome.predictionFailed,
  });

  // Only reached on a genuinely new submission — the duplicate branch above
  // returns early, so the transcript never gains a second image turn.
  const botMessage = await recordImageTurn(
    sessionId,
    locale,
    outcome.predictionFailed,
    followUpMessage,
  );

  return {
    imageId,
    botMessage,
    followUpMessage,
    phase,
    visualResult: outcome.visualResult,
    predictionFailed: outcome.predictionFailed,
    finalOutput,
  };
}

/**
 * Report whether the image gate has resolved for a session.
 *
 * The gate resolves once a visual result is recorded, which covers both a
 * successful prediction and the permanent-failure NEGATIVE fallback.
 *
 * Requirements: 2.2, 8.2, 10.3
 */
export async function getImageGateStatus(sessionId: string): Promise<ImageGateStatus> {
  const image = await prisma.screeningImage.findUnique({
    where: { sessionId },
    select: { visualResult: true, predictionFailed: true },
  });

  if (!image) {
    return { resolved: false, visualResult: null, predictionFailed: false };
  }

  return {
    resolved: image.visualResult !== null,
    visualResult: image.visualResult,
    predictionFailed: image.predictionFailed,
  };
}
