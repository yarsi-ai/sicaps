import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/db/prisma';
import { getSessionScoring } from './testing.service';

const mockFindUnique = vi.mocked(prisma.screeningSession.findUnique);

const MOCK_SESSION = {
  id: 'session-abc',
  source: 'testing',
  status: 'COMPLETED',
  mode: 'ai',
  createdAt: new Date('2025-01-15T10:00:00Z'),
  completedAt: new Date('2025-01-15T10:30:00Z'),
  metadata: { offTopicCount: 1, shortAnswerCount: 2, followUpTarget: 'intensitas' },
  perception: 'ADEQUATE',
  scores: { intensitas: 3, waktu: 2, lokasi_tubuh: 0, kontak: 4, lesi: 0, faktor_risiko: 3 },
  aiConclusion: 'Berdasarkan gejala yang disampaikan...',
  aiPerceptionResponse: 'Pengguna menunjukkan pemahaman...',
  aiRecommendation: 'Disarankan untuk berkonsultasi...',
  aiSuggestion: 'Menjaga kebersihan...',
  totalScore: 12,
  riskLevel: 'MODERATE',
  categoriesCovered: ['intensitas', 'waktu'],
  demographics: {
    id: 'demo-1',
    sessionId: 'session-abc',
    age: 16,
    gender: 'male',
    educationLevel: 'JUNIOR_HIGH',
    name: null,
    createdAt: new Date(),
  },
  turnLogs: [
    {
      id: 'log-1',
      sessionId: 'session-abc',
      turnNumber: 1,
      userMessage: 'saya gatal',
      rawResponse: '{"reply":"Oke","extraction":{}}',
      parseStatus: 'SUCCESS',
      parseError: null,
      systemMessage: 'system prompt here',
      model: 'llama-3.1-8b-instant',
      promptVersion: 'v1',
      latencyMs: 1200,
      tokenUsage: { input: 100, output: 50 },
      retryCount: 0,
      createdAt: new Date(),
    },
    {
      id: 'log-2',
      sessionId: 'session-abc',
      turnNumber: 2,
      userMessage: 'sudah seminggu',
      rawResponse: 'invalid json',
      parseStatus: 'FAILURE',
      parseError: 'JSON parse error',
      systemMessage: 'system prompt here',
      model: 'llama-3.1-8b-instant',
      promptVersion: 'v1',
      latencyMs: 800,
      tokenUsage: null,
      retryCount: 1,
      createdAt: new Date(),
    },
  ],
  extractions: [
    {
      id: 'ext-1',
      sessionId: 'session-abc',
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
      createdAt: new Date(),
    },
  ],
  evaluationFeedbacks: [
    {
      id: 'fb-1',
      sessionId: 'session-abc',
      turnNumber: 1,
      evaluatorType: 'DEVELOPER',
      isAccurate: true,
      notes: null,
      promptVersion: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe('getSessionScoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enriched scoring data for a valid testing session', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);

    const result = await getSessionScoring('session-abc');

    expect(result.session.id).toBe('session-abc');
    expect(result.session.source).toBe('testing');
    expect(result.session.status).toBe('COMPLETED');
    expect(result.session.mode).toBe('ai');
    expect(result.session.demographics).toBeDefined();
    expect(result.session.metadata).toEqual({
      offTopicCount: 1,
      shortAnswerCount: 2,
      followUpTarget: 'intensitas',
    });
    expect(result.session.perception).toBe('ADEQUATE');
    expect(result.session.scores).toEqual({
      intensitas: 3,
      waktu: 2,
      lokasi_tubuh: 0,
      kontak: 4,
      lesi: 0,
      faktor_risiko: 3,
    });
    expect(result.session.output).toEqual({
      conclusion: 'Berdasarkan gejala yang disampaikan...',
      perceptionResponse: 'Pengguna menunjukkan pemahaman...',
      recommendation: 'Disarankan untuk berkonsultasi...',
      suggestion: 'Menjaga kebersihan...',
    });
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(getSessionScoring('nonexistent')).rejects.toThrow('Session not found');
  });

  it('throws ForbiddenError when session source is not testing', async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_SESSION, source: 'production' } as never);

    await expect(getSessionScoring('session-abc')).rejects.toThrow(
      'Cannot access production session via test API',
    );
  });

  it('builds turns array joining logs, extractions, and feedback', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);

    const result = await getSessionScoring('session-abc');

    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].turnNumber).toBe(1);
    expect(result.turns[0].extraction).not.toBeNull();
    expect(result.turns[0].feedback).not.toBeNull();
    expect(result.turns[1].turnNumber).toBe(2);
    expect(result.turns[1].extraction).toBeNull();
    expect(result.turns[1].feedback).toBeNull();
  });

  it('computes categoriesRemaining from CONFIG.scoringCategories', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);

    const result = await getSessionScoring('session-abc');

    expect(result.scoring.categoriesCovered).toEqual(['intensitas', 'waktu']);
    expect(result.scoring.categoriesRemaining).toEqual([
      'lokasi_tubuh',
      'kontak',
      'lesi',
      'faktor_risiko',
    ]);
  });

  it('handles session with no turns', async () => {
    mockFindUnique.mockResolvedValue({
      ...MOCK_SESSION,
      turnLogs: [],
      extractions: [],
      evaluationFeedbacks: [],
      categoriesCovered: [],
      totalScore: null,
      riskLevel: null,
    } as never);

    const result = await getSessionScoring('session-abc');

    expect(result.turns).toEqual([]);
    expect(result.scoring.totalScore).toBeNull();
    expect(result.scoring.categoriesRemaining).toEqual([
      'intensitas',
      'waktu',
      'lokasi_tubuh',
      'kontak',
      'lesi',
      'faktor_risiko',
    ]);
  });

  it('returns null for output fields when session is in-progress', async () => {
    mockFindUnique.mockResolvedValue({
      ...MOCK_SESSION,
      status: 'IN_PROGRESS',
      completedAt: null,
      perception: null,
      aiConclusion: null,
      aiPerceptionResponse: null,
      aiRecommendation: null,
      aiSuggestion: null,
    } as never);

    const result = await getSessionScoring('session-abc');

    expect(result.session.status).toBe('IN_PROGRESS');
    expect(result.session.perception).toBeNull();
    expect(result.session.output).toEqual({
      conclusion: null,
      perceptionResponse: null,
      recommendation: null,
      suggestion: null,
    });
  });

  it('returns metadata as null when session has no metadata', async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_SESSION, metadata: null } as never);

    const result = await getSessionScoring('session-abc');

    expect(result.session.metadata).toBeNull();
  });

  it('calls prisma with correct params', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);

    await getSessionScoring('session-abc');

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'session-abc' },
      include: {
        demographics: true,
        turnLogs: { orderBy: { turnNumber: 'asc' } },
        extractions: { orderBy: { turnNumber: 'asc' } },
        evaluationFeedbacks: true,
      },
    });
  });
});
