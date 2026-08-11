import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { CONFIG } from '@/lib/config';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { verifyConsolePin } from '@/services/console-auth.service';

import { verifyPinSchema } from './schema';

/**
 * POST /api/console/auth/verify
 *
 * Validates submitted PIN and issues session cookie on success.
 * Business logic (rate limiting, PIN comparison, session issuance) lives in
 * `services/console-auth.service.ts`.
 *
 * **Validates: Requirements 1.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 8.2, 8.3, 8.5**
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = verifyPinSchema.safeParse(body);
    // Malformed/missing pin field is a validation error, same as an empty PIN (Req 3.3)
    const pin = parsed.success ? parsed.data.pin : '';
    const redirect = parsed.success ? parsed.data.redirect : undefined;

    const result = verifyConsolePin({ ip, pin, redirect });

    const response = NextResponse.json(successResponse({ redirect: result.redirect }, requestId), {
      status: 200,
    });

    // httpOnly session cookie; PIN itself never leaves the server (Req 8.2)
    response.cookies.set(CONFIG.console.SESSION_COOKIE_NAME, result.cookieValue, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      // No `path` restriction: the cookie must be sent for both /console/* pages
      // and /api/console/* routes (Requirement 1.5 — uniform protection for
      // future child routes without per-route configuration).
      maxAge: CONFIG.console.SESSION_DURATION_HOURS * 60 * 60,
    });

    return response;
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
      });
    }
    console.error('[console/auth/verify] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500 },
    );
  }
}
