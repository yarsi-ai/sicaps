import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG, SCREENING_CHAT_VERSION } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';

import { sessionParamsSchema } from './schema';

/**
 * GET /api/screening/[id]/session
 *
 * V2: Validate param → call resumeSession (checks TTL + status) → return session state.
 * V1: Validate param + token → verifySessionAccess → getSessionState.
 *
 * Requirements: 13.1, 18.3, 18.4
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rateLimitResult = safeCheckRateLimit(ip, CONFIG.rateLimit.session);
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
    const resolvedParams = await params;
    const parsedParams = sessionParamsSchema.safeParse(resolvedParams);

    if (!parsedParams.success) {
      return NextResponse.json(
        errorResponse(
          'VALIDATION_ERROR',
          'Invalid session ID',
          zodToFieldErrors(parsedParams.error),
          requestId,
        ),
        { status: 400, headers },
      );
    }

    if (SCREENING_CHAT_VERSION === 'v2') {
      const { resumeSession } = await import('@/features/screening-chat-v2');
      const result = await resumeSession(parsedParams.data.id);

      if (!result) {
        return NextResponse.json(
          errorResponse('NOT_FOUND', 'Session not found or expired', undefined, requestId),
          { status: 404, headers },
        );
      }
      return NextResponse.json(successResponse(result, requestId), { status: 200, headers });
    }

    // V1 path: requires token-based access control
    const token = request.nextUrl.searchParams.get('token');
    const { verifySessionAccess, getSessionState } = await import('@/features/screening-chat-v1');
    const session = await verifySessionAccess(parsedParams.data.id, token);
    const result = await getSessionState(session.id);

    return NextResponse.json(successResponse(result, requestId), { status: 200, headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers,
      });
    }
    console.error('[screening/:id/session] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}
