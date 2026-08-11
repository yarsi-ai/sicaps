import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { CONFIG } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { checkLLMHealth } from '@/services/llm.service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rateLimitResult = safeCheckRateLimit(ip, CONFIG.rateLimit.health);
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
    const llmAvailable = await checkLLMHealth();
    return NextResponse.json(successResponse({ status: 'ok', llmAvailable }, requestId), {
      headers,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(errorResponse(err.code, err.message, undefined, requestId), {
        status: err.statusCode,
        headers,
      });
    }
    console.error('[health] Unexpected error', { requestId, err });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}
