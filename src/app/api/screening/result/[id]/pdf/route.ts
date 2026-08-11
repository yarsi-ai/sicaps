import { NextRequest } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG } from '@/lib/config';
import type { SupportedLocale } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { generateResultPdf } from '@/services/pdf.service';
import { verifySessionAccess } from '@/features/screening-chat-v1';

import { pdfParamsSchema } from './schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rateLimitResult = safeCheckRateLimit(ip, CONFIG.rateLimit.pdf);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    return Response.json(
      errorResponse('RATE_LIMITED', 'Rate limit exceeded', undefined, requestId),
      {
        status: 429,
        headers: { ...rateLimitHeaders, 'Retry-After': String(rateLimitResult.retryAfterSeconds) },
      },
    );
  }

  try {
    const resolvedParams = await params;
    const parsedParams = pdfParamsSchema.safeParse(resolvedParams);

    if (!parsedParams.success) {
      return Response.json(
        errorResponse(
          'VALIDATION_ERROR',
          'Invalid session ID',
          zodToFieldErrors(parsedParams.error),
          requestId,
        ),
        { status: 400, headers: rateLimitHeaders },
      );
    }

    const token = request.nextUrl.searchParams.get('token');
    const session = await verifySessionAccess(parsedParams.data.id, token, {
      requireCompleted: true,
    });
    const pdfBuffer = await generateResultPdf(session.id, session.locale as SupportedLocale);

    const today = new Date().toISOString().split('T')[0];
    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="SICAPS-Screening-${today}.pdf"`,
        ...rateLimitHeaders,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers: rateLimitHeaders,
      });
    }
    console.error('[screening/result/:id/pdf] Unexpected error', { requestId, error });
    return Response.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers: rateLimitHeaders },
    );
  }
}
