import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/db/prisma';
import { errorResponse, successResponse } from '@/lib/api/response';
import { SCREENING_CHAT_VERSION } from '@/lib/config';

import { createTestSessionSchema } from './schema';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = createTestSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      errorResponse('VALIDATION_ERROR', 'Validation failed', [parsed.error.flatten().fieldErrors]),
      { status: 400 },
    );
  }

  const { age, gender, educationLevel, locale } = parsed.data;

  if (SCREENING_CHAT_VERSION === 'v2') {
    // Use the same createSession service as the main chat app
    const { createSession } = await import('@/features/screening-chat-v2');
    const result = await createSession({ locale, mode: 'ai' });

    // Add demographics + mark as testing source
    await prisma.screeningSession.update({
      where: { id: result.sessionId },
      data: {
        source: 'testing',
        demographics: {
          create: { age, gender, educationLevel },
        },
      },
    });

    return NextResponse.json(
      successResponse({
        sessionId: result.sessionId,
        source: 'testing',
        greeting: result.greeting,
      }),
    );
  }

  // V1 fallback
  const session = await prisma.screeningSession.create({
    data: {
      source: 'testing',
      locale,
      demographics: {
        create: { age, gender, educationLevel },
      },
    },
  });

  return NextResponse.json(successResponse({ sessionId: session.id, source: 'testing' }));
}
