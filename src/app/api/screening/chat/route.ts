import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG, SCREENING_CHAT_VERSION } from '@/lib/config';
import { AppError, MessageEmptyError, MessageTooLongError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { sanitizeUserInput, stripHtmlContent } from '@/lib/sanitize';

import { chatV2Schema } from './schema';
import { handleV1Chat } from './_v1-handler';

/**
 * POST /api/screening/chat
 *
 * V2: Validate input → sanitize → call processChatTurn → stream SSE.
 * V1: Delegated to _v1-handler for backward compatibility.
 *
 * Requirements: 5.2, 12.1–12.8, 18.1, 18.3, 18.4
 */
export async function POST(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID();
  const body = await request.json();

  if (SCREENING_CHAT_VERSION === 'v1') {
    return handleV1Chat(body, requestId, request.headers);
  }

  const parsed = chatV2Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse(
        'VALIDATION_ERROR',
        'Invalid request body',
        zodToFieldErrors(parsed.error),
        requestId,
      ),
      { status: 400 },
    );
  }

  const { sessionId, message, quickReplyToken, isVoice } = parsed.data;
  const rateLimitResult = safeCheckRateLimit(sessionId, CONFIG.rateLimit.chat);
  const headers = getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      errorResponse('RATE_LIMITED', 'Rate limit exceeded', undefined, requestId),
      {
        status: 429,
        headers: { ...headers, 'Retry-After': String(rateLimitResult.retryAfterSeconds) },
      },
    );
  }

  try {
    if (message.length > CONFIG.sessionLimits.MAX_MESSAGE_LENGTH) throw new MessageTooLongError();
    const sanitized = stripHtmlContent(sanitizeUserInput(message));
    if (!sanitized.trim()) throw new MessageEmptyError();

    const { processChatTurn } = await import('@/features/screening-chat-v2');
    const stream = await processChatTurn({
      sessionId,
      message: sanitized,
      quickReplyToken,
      isVoice,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...headers,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers,
      });
    }
    console.error('[screening/chat] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}
