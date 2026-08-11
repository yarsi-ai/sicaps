import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/db/prisma';
import { errorResponse, successResponse } from '@/lib/api/response';

import { feedbackSchema } from './schema';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: sessionId } = await params;
  const body = await request.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      errorResponse('VALIDATION_ERROR', 'Validation failed', [parsed.error.flatten().fieldErrors]),
      { status: 400 },
    );
  }

  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return NextResponse.json(errorResponse('NOT_FOUND', 'Session not found'), { status: 404 });
  }

  const { turnNumber, evaluatorType, isAccurate, notes } = parsed.data;

  const feedback = await prisma.evaluationFeedback.upsert({
    where: {
      sessionId_turnNumber_evaluatorType: { sessionId, turnNumber, evaluatorType },
    },
    create: {
      sessionId,
      turnNumber,
      evaluatorType,
      isAccurate,
      notes: notes ?? null,
      promptVersion: session.promptVersion,
    },
    update: {
      isAccurate,
      notes: notes ?? null,
    },
  });

  return NextResponse.json(successResponse({ id: feedback.id, isAccurate, turnNumber }));
}
