import { NextRequest, NextResponse } from 'next/server';

import { errorResponse, successResponse } from '@/lib/api/response';
import { CONFIG } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { submitImage } from '@/services/visual-detection.service';

import { parseImageUploadRequest } from './schema';

/**
 * POST /api/screening/image
 *
 * Accept multipart/form-data with an image file, sessionId, and consentGiven.
 * Resolves the image gate: the response carries the final visual result, so the
 * client needs no follow-up poll.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 13.3
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const formData = await request.formData();

    const sessionIdRaw = formData.get('sessionId');
    const rateLimit = safeCheckRateLimit(
      typeof sessionIdRaw === 'string' ? sessionIdRaw : '',
      CONFIG.rateLimit.image,
    );
    const headers = getRateLimitHeaders(rateLimit);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        errorResponse('RATE_LIMITED', 'Rate limit exceeded', undefined, requestId),
        {
          status: 429,
          headers: { ...headers, 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const parsed = await parseImageUploadRequest(formData);

    if (!parsed.ok) {
      return NextResponse.json(
        errorResponse('VALIDATION_ERROR', parsed.error.message, parsed.error.details, requestId),
        { status: 400, headers },
      );
    }

    const result = await submitImage(parsed.value);

    return NextResponse.json(successResponse(result, requestId), { status: 201, headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
      });
    }
    console.error('[screening/image] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500 },
    );
  }
}
