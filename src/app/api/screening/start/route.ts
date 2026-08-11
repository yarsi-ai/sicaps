import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG, SCREENING_CHAT_VERSION } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { sanitizeUserInput, stripHtmlContent } from '@/lib/sanitize';

import { startRequestSchema, startV2RequestSchema } from './schema';

/**
 * POST /api/screening/start
 *
 * V2: Validate locale/mode → call createSession → return sessionId + phase.
 * V1: Validate demographics → call v1 createSession → return result.
 *
 * Requirements: 13.1, 18.1, 18.3, 18.4
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rateLimitResult = safeCheckRateLimit(ip, CONFIG.rateLimit.start);
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
    const body = await request.json();

    if (SCREENING_CHAT_VERSION === 'v2') {
      return await handleV2Start(body, requestId, headers);
    }
    return await handleV1Start(body, requestId, headers);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers,
      });
    }
    console.error('[screening/start] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}

async function handleV2Start(
  body: unknown,
  requestId: string,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const parsed = startV2RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse(
        'VALIDATION_ERROR',
        'Invalid request body',
        zodToFieldErrors(parsed.error),
        requestId,
      ),
      { status: 400, headers },
    );
  }

  const { createSession } = await import('@/features/screening-chat-v2');
  const result = await createSession(parsed.data);

  return NextResponse.json(successResponse(result, requestId), { status: 201, headers });
}

async function handleV1Start(
  body: unknown,
  requestId: string,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const parsed = startRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse(
        'VALIDATION_ERROR',
        'Invalid request body',
        zodToFieldErrors(parsed.error),
        requestId,
      ),
      { status: 400, headers },
    );
  }

  const input = parsed.data;
  if (input.demographics.name) {
    input.demographics.name = stripHtmlContent(sanitizeUserInput(input.demographics.name));
  }

  const { createSession } = await import('@/features/screening-chat-v1');
  const result = await createSession(input);

  return NextResponse.json(successResponse(result, requestId), { status: 201, headers });
}
