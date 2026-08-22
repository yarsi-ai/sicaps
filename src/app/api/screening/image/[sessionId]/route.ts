import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { getImageGateStatus } from '@/services/visual-detection.service';

import { sessionIdParamsSchema } from './schema';

/**
 * GET /api/screening/image/[sessionId]
 *
 * Query image status for a screening session.
 * Returns whether an image exists, prediction completion status, and visual result.
 * Used for polling from useImageUpload hook to determine gate resolution.
 *
 * Requirements: 5.1
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
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
    const parsedParams = sessionIdParamsSchema.safeParse(resolvedParams);

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

    const status = await getImageGateStatus(parsedParams.data.sessionId);

    return NextResponse.json(successResponse(status, requestId), { status: 200, headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers,
      });
    }
    console.error('[screening/image/:sessionId] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}
