import { NextResponse } from 'next/server';

import { prisma } from '@/db/prisma';
import { successResponse } from '@/lib/api/response';

export async function GET(): Promise<NextResponse> {
  const sessions = await prisma.screeningSession.findMany({
    where: {
      source: 'testing',
      messages: { some: {} }, // only sessions with at least 1 message
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      source: true,
      riskLevel: true,
      totalScore: true,
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const data = sessions.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    source: s.source,
    riskLevel: s.riskLevel,
    totalScore: s.totalScore,
    messageCount: s._count.messages,
  }));

  return NextResponse.json(successResponse(data));
}
