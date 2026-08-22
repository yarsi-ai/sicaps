import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/api/ip';
import { errorResponse, successResponse } from '@/lib/api/response';
import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG, SCREENING_CHAT_VERSION } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';

import { transcriptParamsSchema } from './schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const ip = getClientIp(request.headers);
  const rateLimitResult = safeCheckRateLimit(ip, CONFIG.rateLimit.transcript);
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
    const parsedParams = transcriptParamsSchema.safeParse(resolvedParams);

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
      // V2: verify access by checking token matches sessionId
      const token = request.nextUrl.searchParams.get('token');
      if (!token || token !== parsedParams.data.id) {
        return NextResponse.json(
          errorResponse('FORBIDDEN', 'Invalid or missing token', undefined, requestId),
          { status: 403, headers },
        );
      }

      const { prisma } = await import('@/db/prisma');
      const messages = await prisma.chatMessage.findMany({
        where: { sessionId: parsedParams.data.id },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true, createdAt: true, isVoice: true, kind: true },
      });

      if (messages.length === 0) {
        return NextResponse.json(
          errorResponse('NOT_FOUND', 'Transcript not found', undefined, requestId),
          { status: 404, headers },
        );
      }

      const transcript = {
        messages: messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'bot',
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          isVoice: m.isVoice,
          // `IMAGE` turns render as a locked photo placeholder rather than text:
          // the photo itself lives in a private bucket and is never served here.
          kind: m.kind,
        })),
      };

      return NextResponse.json(successResponse(transcript, requestId), { status: 200, headers });
    }

    // V1 path: requires token-based access control
    const { getTranscript, verifySessionAccess } = await import('@/features/screening-chat-v1');
    const token = request.nextUrl.searchParams.get('token');
    const session = await verifySessionAccess(parsedParams.data.id, token);
    const result = await getTranscript(session.id);

    return NextResponse.json(successResponse(result, requestId), { status: 200, headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message, undefined, requestId), {
        status: error.statusCode,
        headers,
      });
    }
    console.error('[screening/:id/transcript] Unexpected error', { requestId, error });
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
      { status: 500, headers },
    );
  }
}
