import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/prisma', () => ({
  prisma: {
    turnLog: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/db/prisma';
import { GET } from './route';

const mockFindMany = vi.mocked(prisma.turnLog.findMany);

function createRequest(queryParams: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/test/evaluations/export');
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
}

const MOCK_TURN_LOGS = [
  {
    id: 'log-1',
    sessionId: 'session-abc',
    turnNumber: 1,
    userMessage: 'saya gatal',
    rawResponse: '{"reply":"Oke, saya mengerti","extraction":{}}',
    parseStatus: 'SUCCESS',
    parseError: null,
    systemMessage: 'You are a screening assistant',
    model: 'llama-3.1-8b-instant',
    promptVersion: 'v1',
    latencyMs: 1200,
    tokenUsage: { input: 100, output: 50 },
    retryCount: 0,
    createdAt: new Date('2025-01-15T10:00:00Z'),
    session: {
      source: 'testing',
      totalScore: 12,
      riskLevel: 'MODERATE',
      extractions: [
        {
          turnNumber: 1,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 0.9 }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          scores: {
            intensitas: { score: 3, matched: 1 },
            waktu: { score: 0, matched: 0 },
            lokasi_tubuh: { score: 0, matched: 0 },
            kontak: { score: 0, matched: 0 },
            lesi: { score: 0, matched: 0 },
            faktor_risiko: { score: 0, matched: 0 },
          },
        },
      ],
      evaluationFeedbacks: [
        {
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
          isAccurate: true,
          notes: 'looks good',
          promptVersion: 'v1',
        },
      ],
    },
  },
  {
    id: 'log-2',
    sessionId: 'session-abc',
    turnNumber: 2,
    userMessage: 'sudah seminggu',
    rawResponse: 'invalid json',
    parseStatus: 'FAILURE',
    parseError: 'JSON parse error',
    systemMessage: 'You are a screening assistant',
    model: 'llama-3.1-8b-instant',
    promptVersion: 'v1',
    latencyMs: 800,
    tokenUsage: null,
    retryCount: 1,
    createdAt: new Date('2025-01-15T10:01:00Z'),
    session: {
      source: 'testing',
      totalScore: 12,
      riskLevel: 'MODERATE',
      extractions: [
        {
          turnNumber: 1,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 0.9 }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          scores: {
            intensitas: { score: 3, matched: 1 },
            waktu: { score: 0, matched: 0 },
            lokasi_tubuh: { score: 0, matched: 0 },
            kontak: { score: 0, matched: 0 },
            lesi: { score: 0, matched: 0 },
            faktor_risiko: { score: 0, matched: 0 },
          },
        },
      ],
      evaluationFeedbacks: [
        {
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
          isAccurate: true,
          notes: 'looks good',
          promptVersion: 'v1',
        },
      ],
    },
  },
];

describe('GET /api/test/evaluations/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV with correct headers and content', async () => {
    mockFindMany.mockResolvedValue(MOCK_TURN_LOGS as never);

    const response = await GET(createRequest());
    const csv = await response.text();
    const lines = csv.split('\n');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain(
      'attachment; filename="sicaps-evaluations-',
    );

    // Verify header row
    expect(lines[0]).toBe(
      'sessionId,turnNumber,parseStatus,userMessage,assistantReply,extractedKeywords,matchedPatterns,turnScore,cumulativeScore,riskLevel,isAccurate,feedbackNotes,promptVersion,systemMessage,model,latencyMs,createdAt',
    );

    // Verify data rows exist
    expect(lines).toHaveLength(3); // header + 2 data rows

    // First row: has extraction + feedback
    const row1 = lines[1];
    expect(row1).toContain('session-abc');
    expect(row1).toContain('SUCCESS');
    expect(row1).toContain('gatal');
    expect(row1).toContain('true');

    // Second row: failure, no extraction, no feedback
    const row2 = lines[2];
    expect(row2).toContain('FAILURE');
    expect(row2).toContain('sudah seminggu');
  });

  it('filters to source=testing only via Prisma query', async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(createRequest());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { source: 'testing' },
        }),
      }),
    );
  });

  it('applies date filters when from and to params provided', async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(createRequest({ from: '2025-01-01', to: '2025-01-31' }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { source: 'testing' },
          createdAt: {
            gte: new Date('2025-01-01'),
            lte: new Date('2025-01-31'),
          },
        }),
      }),
    );
  });

  it('returns only headers when no data exists', async () => {
    mockFindMany.mockResolvedValue([]);

    const response = await GET(createRequest());
    const csv = await response.text();
    const lines = csv.split('\n');

    expect(response.status).toBe(200);
    expect(lines).toHaveLength(1); // header only
    expect(lines[0]).toContain('sessionId');
  });

  it('handles evaluatorType query param for feedback filtering', async () => {
    const baseTurnLog = MOCK_TURN_LOGS[0]!;
    const logsWithMultipleFeedback = [
      {
        ...baseTurnLog,
        session: {
          ...baseTurnLog.session,
          evaluationFeedbacks: [
            {
              turnNumber: 1,
              evaluatorType: 'DEVELOPER',
              isAccurate: true,
              notes: 'dev note',
              promptVersion: 'v1',
            },
            {
              turnNumber: 1,
              evaluatorType: 'DOCTOR',
              isAccurate: false,
              notes: 'doc note',
              promptVersion: 'v1',
            },
          ],
        },
      },
    ];
    mockFindMany.mockResolvedValue(logsWithMultipleFeedback as never);

    const response = await GET(createRequest({ evaluatorType: 'DOCTOR' }));
    const csv = await response.text();
    const lines = csv.split('\n');

    // Should use doctor's feedback (isAccurate=false)
    expect(lines[1]).toContain('false');
    expect(lines[1]).toContain('doc note');
  });

  it('escapes CSV values containing commas and quotes', async () => {
    const baseTurnLog = MOCK_TURN_LOGS[0]!;
    const logsWithSpecialChars = [
      {
        ...baseTurnLog,
        userMessage: 'I feel itchy, very itchy',
        rawResponse: '{"reply":"OK, let me ask \\"more\\"","extraction":{}}',
        systemMessage: 'prompt with, commas',
        session: {
          ...baseTurnLog.session,
          evaluationFeedbacks: [],
          extractions: [],
        },
      },
    ];
    mockFindMany.mockResolvedValue(logsWithSpecialChars as never);

    const response = await GET(createRequest());
    const csv = await response.text();

    // Values with commas should be quoted
    expect(csv).toContain('"I feel itchy, very itchy"');
    expect(csv).toContain('"prompt with, commas"');
  });
});
