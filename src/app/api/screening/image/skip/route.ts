import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse, successResponse } from '@/lib/api/response';
import { advancePhaseAfterImage } from '@/features/screening-chat-v2';
import { AppError, NotFoundError } from '@/lib/errors';

const skipBodySchema = z.object({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
});

/**
 * POST /api/screening/image/skip
 *
 * Advances the session out of AWAITING_IMAGE without a photo. Called client-side
 * after the upload has failed CONFIG.visualDetection.MAX_UPLOAD_FAILURES times.
 *
 * No ScreeningImage row is created and no prediction runs — the gate is resolved
 * through the same state machine path as a successful submission, with
 * `imageResolved: true` forcing the transition.
 *
 * Requirements: 2.1
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        errorResponse('VALIDATION_ERROR', 'Request body must be valid JSON', undefined, requestId),
        { status: 400 },
      );
    }

    const parsed = skipBodySchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return NextResponse.json(
        errorResponse('VALIDATION_ERROR', 'Invalid request body', details, requestId),
        { status: 400 },
      );
    }

    const { sessionId } = parsed.data;

    const { phase, followUpMessage } = await advancePhaseAfterImage(sessionId);

    return NextResponse.json(successResponse({ phase, followUpMessage }, requestId), {
      status: 200,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', 'Session not found', undefined, requestId),
        { status: 404 },
      );
    }
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: 422,
      });
    }
    console.error('[image/skip] Unexpected error', error);
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500 },
    );
  }
}
