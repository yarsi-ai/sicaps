import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/db/prisma';

type ExportSource = 'testing' | 'playground';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const evaluatorType = searchParams.get('evaluatorType');
  const source = (searchParams.get('source') ?? 'testing') as ExportSource;
  const sessionId = searchParams.get('sessionId');

  // Build date filter for TurnLog.createdAt
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  // Build session filter
  const sessionFilter: Record<string, unknown> = { source };
  if (sessionId) sessionFilter.id = sessionId;

  const turnLogs = await prisma.turnLog.findMany({
    where: {
      session: sessionFilter,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    },
    include: {
      session: {
        include: {
          extractions: true,
          evaluationFeedbacks: true,
        },
      },
    },
    orderBy: [{ sessionId: 'asc' }, { turnNumber: 'asc' }],
  });

  // Build CSV based on source type
  if (source === 'playground') {
    return buildPlaygroundCsv(turnLogs);
  }
  return buildTestingCsv(turnLogs, evaluatorType);
}

// ==================== Testing CSV ====================

function buildTestingCsv(
  turnLogs: TurnLogWithSession[],
  evaluatorType: string | null,
): NextResponse {
  const headers = [
    'sessionId',
    'turnNumber',
    'parseStatus',
    'userMessage',
    'assistantReply',
    'extractedKeywords',
    'matchedPatterns',
    'turnScore',
    'cumulativeScore',
    'riskLevel',
    'isAccurate',
    'feedbackNotes',
    'promptVersion',
    'systemMessage',
    'model',
    'latencyMs',
    'createdAt',
  ];

  const rows = turnLogs.map((log) => {
    const extraction = log.session.extractions.find((e) => e.turnNumber === log.turnNumber) ?? null;

    const feedback =
      log.session.evaluationFeedbacks.find((f) => {
        if (evaluatorType)
          return f.turnNumber === log.turnNumber && f.evaluatorType === evaluatorType;
        return f.turnNumber === log.turnNumber;
      }) ?? null;

    let assistantReply = '';
    try {
      const parsed = JSON.parse(log.rawResponse);
      assistantReply = parsed.reply || '';
    } catch {
      /* raw response may not be valid JSON */
    }

    let extractedKeywords = '';
    if (extraction) {
      const ext = extraction.extraction as Record<string, Array<{ keyword?: string }>>;
      extractedKeywords = Object.values(ext)
        .flat()
        .map((k) => k.keyword || '')
        .filter(Boolean)
        .join('; ');
    }

    let turnScore = '';
    if (extraction) {
      const scores = extraction.scores as Record<string, { score?: number }>;
      const total = Object.values(scores).reduce((sum, s) => sum + (s.score ?? 0), 0);
      turnScore = String(total);
    }

    return [
      log.sessionId,
      String(log.turnNumber),
      log.parseStatus,
      escapeCsv(log.userMessage),
      escapeCsv(assistantReply),
      escapeCsv(extractedKeywords),
      '',
      turnScore,
      log.session.totalScore != null ? String(log.session.totalScore) : '',
      log.session.riskLevel ?? '',
      feedback ? String(feedback.isAccurate) : '',
      escapeCsv(feedback?.notes ?? ''),
      log.promptVersion,
      escapeCsv(log.systemMessage),
      log.model,
      String(log.latencyMs),
      log.createdAt.toISOString(),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  return csvResponse(csv, 'sicaps-evaluations');
}

// ==================== Playground CSV ====================

interface PlaygroundMetadata {
  source?: string;
  provider?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  customSystemPrompt?: boolean;
  mode?: string;
}

function buildPlaygroundCsv(turnLogs: TurnLogWithSession[]): NextResponse {
  const headers = [
    'sessionId',
    'turnNumber',
    'parseStatus',
    'userMessage',
    'assistantReply',
    'provider',
    'model',
    'temperature',
    'topP',
    'maxTokens',
    'customSystemPrompt',
    'mode',
    'latencyMs',
    'tokensIn',
    'tokensOut',
    'createdAt',
  ];

  const rows = turnLogs.map((log) => {
    const metadata = (log.metadata as PlaygroundMetadata) ?? {};

    let assistantReply = '';
    try {
      const parsed = JSON.parse(log.rawResponse);
      assistantReply = parsed.reply || '';
    } catch {
      /* raw response may not be valid JSON */
    }

    const tokenUsage = log.tokenUsage as { input?: number; output?: number } | null;

    return [
      log.sessionId,
      String(log.turnNumber),
      log.parseStatus,
      escapeCsv(log.userMessage),
      escapeCsv(assistantReply),
      metadata.provider ?? log.model,
      log.model,
      metadata.temperature != null ? String(metadata.temperature) : '',
      metadata.topP != null ? String(metadata.topP) : '',
      metadata.maxTokens != null ? String(metadata.maxTokens) : '',
      metadata.customSystemPrompt != null ? String(metadata.customSystemPrompt) : '',
      metadata.mode ?? '',
      String(log.latencyMs),
      tokenUsage?.input != null ? String(tokenUsage.input) : '',
      tokenUsage?.output != null ? String(tokenUsage.output) : '',
      log.createdAt.toISOString(),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  return csvResponse(csv, 'sicaps-playground');
}

// ==================== Shared Helpers ====================

function csvResponse(csv: string, prefix: string): NextResponse {
  const filename = `${prefix}-${new Date().toISOString().split('T')[0]}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ==================== Types ====================

type TurnLogWithSession = Awaited<ReturnType<typeof prisma.turnLog.findMany>>[number] & {
  session: {
    extractions: Array<{ turnNumber: number; extraction: unknown; scores: unknown }>;
    evaluationFeedbacks: Array<{
      turnNumber: number;
      evaluatorType: string;
      isAccurate: boolean;
      notes: string | null;
    }>;
    totalScore: number | null;
    riskLevel: string | null;
    source: string;
  };
};
