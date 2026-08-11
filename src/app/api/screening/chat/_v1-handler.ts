import { NextResponse } from 'next/server';

import { prisma } from '@/db/prisma';
import { errorResponse, successResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG } from '@/lib/config';
import {
  AppError,
  MessageEmptyError,
  MessageTooLongError,
  SessionCompletedError,
  SessionExpiredError,
  SessionNotFoundError,
} from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { sanitizeUserInput, stripHtmlContent } from '@/lib/sanitize';
import { processChatTurn, processQuestionnaireAnswer } from '@/features/screening-chat-v1';

import { chatAiSchema, chatQuestionnaireSchema } from './schema';

/** In-memory set for double-send protection (per-instance) */
const activeSessions = new Set<string>();
const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;

/**
 * V1 chat handler — preserved for backward compatibility during v1→v2 migration.
 * Handles both AI mode (free text) and questionnaire mode (pill selections).
 */
export async function handleV1Chat(
  body: unknown,
  requestId: string,
  _headers: Headers,
): Promise<Response> {
  const aiParsed = chatAiSchema.safeParse(body);
  const questionnaireParsed = chatQuestionnaireSchema.safeParse(body);

  if (!aiParsed.success && !questionnaireParsed.success) {
    return NextResponse.json(
      errorResponse(
        'VALIDATION_ERROR',
        'Invalid request body',
        zodToFieldErrors(aiParsed.error!),
        requestId,
      ),
      { status: 400 },
    );
  }

  const isAiRequest = aiParsed.success;
  const sessionId = isAiRequest ? aiParsed.data.sessionId : questionnaireParsed.data!.sessionId;
  const rateLimitResult = safeCheckRateLimit(sessionId, CONFIG.rateLimit.chat);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      errorResponse('RATE_LIMITED', 'Rate limit exceeded', undefined, requestId),
      {
        status: 429,
        headers: { ...rateLimitHeaders, 'Retry-After': String(rateLimitResult.retryAfterSeconds) },
      },
    );
  }

  if (activeSessions.has(sessionId)) {
    return NextResponse.json(
      errorResponse(
        'SESSION_BUSY',
        'Session is currently processing another request',
        undefined,
        requestId,
      ),
      { status: 409, headers: rateLimitHeaders },
    );
  }

  activeSessions.add(sessionId);

  try {
    const session = await prisma.screeningSession.findUnique({
      where: { id: sessionId },
      select: { id: true, mode: true, status: true, updatedAt: true },
    });

    if (!session) throw new SessionNotFoundError();
    if (session.status === 'COMPLETED') throw new SessionCompletedError();
    if (Date.now() - session.updatedAt.getTime() > IDLE_LIMIT_MS) throw new SessionExpiredError();

    if (session.mode === 'ai' && !isAiRequest) {
      return NextResponse.json(
        errorResponse(
          'VALIDATION_ERROR',
          'AI mode session requires message field, not selectedPills',
          undefined,
          requestId,
        ),
        { status: 400, headers: rateLimitHeaders },
      );
    }
    if (session.mode === 'questionnaire' && isAiRequest) {
      return NextResponse.json(
        errorResponse(
          'VALIDATION_ERROR',
          'Questionnaire mode session requires selectedPills, not message',
          undefined,
          requestId,
        ),
        { status: 400, headers: rateLimitHeaders },
      );
    }

    if (isAiRequest) {
      const { message, isVoice } = aiParsed.data;
      if (message.length > CONFIG.sessionLimits.MAX_MESSAGE_LENGTH) throw new MessageTooLongError();
      const sanitized = stripHtmlContent(sanitizeUserInput(message));
      if (!sanitized.trim()) throw new MessageEmptyError();

      const stream = await processChatTurn(sessionId, sanitized, isVoice);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...rateLimitHeaders,
        },
      });
    }

    const { selectedPills } = questionnaireParsed.data!;
    const result = await processQuestionnaireAnswer(sessionId, selectedPills);
    return NextResponse.json(successResponse(result, requestId), {
      status: 200,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers: rateLimitHeaders,
      });
    }
    console.error('[screening/chat] V1 unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers: rateLimitHeaders },
    );
  } finally {
    activeSessions.delete(sessionId);
  }
}
