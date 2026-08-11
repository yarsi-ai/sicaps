import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    screeningSession: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/services/llm.service', () => ({
  checkLLMHealth: vi.fn(),
}));

vi.mock('@/lib/token', () => ({
  verifyShareToken: vi.fn(),
}));

import { prisma } from '@/db/prisma';
import { checkLLMHealth } from '@/services/llm.service';
import { verifyShareToken } from '@/lib/token';
import {
  createSession,
  getSessionState,
  getResult,
  verifySessionAccess,
  type StartInput,
} from './screening.service';

const mockedPrisma = vi.mocked(prisma, { deep: true });
const mockedCheckLLMHealth = vi.mocked(checkLLMHealth);
const mockedVerifyShareToken = vi.mocked(verifyShareToken);

describe('createSession', () => {
  const validInput: StartInput = {
    demographics: {
      name: 'Test User',
      age: 16,
      gender: 'male',
      educationLevel: 'senior_high',
    },
    locale: 'id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates session in AI mode when LLM is available', async () => {
    mockedCheckLLMHealth.mockResolvedValue(true);
    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        screeningSession: {
          create: vi.fn().mockResolvedValue({
            id: 'session-123',
            shareToken: 'token-456',
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createSession(validInput);

    expect(result.sessionId).toBe('session-123');
    expect(result.shareToken).toBe('token-456');
    expect(result.mode).toBe('ai');
    expect(result.theme).toBe('hybrid');
    expect(result.locale).toBe('id');
    expect(result.openingMessage).toBeTypeOf('string');
    expect(result.openingMessage.length).toBeGreaterThan(0);
    expect(result.pills).toBeUndefined();
    expect(result.pillSelection).toBeUndefined();
  });

  it('creates session in questionnaire mode when LLM is unavailable', async () => {
    mockedCheckLLMHealth.mockResolvedValue(false);
    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        screeningSession: {
          create: vi.fn().mockResolvedValue({
            id: 'session-789',
            shareToken: 'token-abc',
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createSession(validInput);

    expect(result.mode).toBe('questionnaire');
    expect(result.pills).toBeDefined();
    expect(result.pills!.length).toBe(2);
    expect(result.pills![0].id).toBe('confirm_continue');
    expect(result.pillSelection).toBe('single');
    expect(result.openingMessage).toContain('offline');
  });

  it('derives playful theme from elementary education level', async () => {
    mockedCheckLLMHealth.mockResolvedValue(true);
    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        screeningSession: {
          create: vi.fn().mockResolvedValue({
            id: 'session-elem',
            shareToken: 'token-elem',
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createSession({
      ...validInput,
      demographics: { ...validInput.demographics, educationLevel: 'elementary' },
    });

    expect(result.theme).toBe('playful');
  });

  it('derives hybrid theme from non-elementary education levels', async () => {
    mockedCheckLLMHealth.mockResolvedValue(true);
    const levels = ['junior_high', 'senior_high'] as const;

    for (const level of levels) {
      mockedPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          screeningSession: {
            create: vi.fn().mockResolvedValue({
              id: `session-${level}`,
              shareToken: `token-${level}`,
            }),
          },
        };
        return fn(tx as never);
      });

      const result = await createSession({
        ...validInput,
        demographics: { ...validInput.demographics, educationLevel: level },
      });

      expect(result.theme).toBe('hybrid');
    }
  });

  it('passes correct data to Prisma transaction', async () => {
    mockedCheckLLMHealth.mockResolvedValue(true);
    let capturedCreateData: unknown = null;

    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'session-data',
        shareToken: 'token-data',
      });
      const tx = {
        screeningSession: { create: mockCreate },
      };
      const result = await fn(tx as never);
      capturedCreateData = mockCreate.mock.calls[0][0];
      return result;
    });

    await createSession(validInput);

    expect(capturedCreateData).toMatchObject({
      data: {
        locale: 'id',
        mode: 'ai',
        status: 'IN_PROGRESS',
        demographics: {
          create: {
            name: 'Test User',
            age: 16,
            gender: 'male',
            educationLevel: 'SENIOR_HIGH',
          },
        },
      },
      select: {
        id: true,
        shareToken: true,
      },
    });
  });

  it('handles null name in demographics', async () => {
    mockedCheckLLMHealth.mockResolvedValue(true);
    let capturedCreateData: unknown = null;

    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'session-null-name',
        shareToken: 'token-null-name',
      });
      const tx = {
        screeningSession: { create: mockCreate },
      };
      const result = await fn(tx as never);
      capturedCreateData = mockCreate.mock.calls[0][0];
      return result;
    });

    await createSession({
      ...validInput,
      demographics: { ...validInput.demographics, name: null },
    });

    const data = capturedCreateData as { data: { demographics: { create: { name: unknown } } } };
    expect(data.data.demographics.create.name).toBeNull();
  });

  it('returns English opening message and pills for en locale in questionnaire mode', async () => {
    mockedCheckLLMHealth.mockResolvedValue(false);
    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        screeningSession: {
          create: vi.fn().mockResolvedValue({
            id: 'session-en',
            shareToken: 'token-en',
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createSession({ ...validInput, locale: 'en' });

    expect(result.locale).toBe('en');
    expect(result.openingMessage).toContain('offline');
    expect(result.pills![0].label).toBe('Yes, continue');
    expect(result.pills![1].label).toBe('Maybe later');
  });
});

describe('getSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    id: 'session-123',
    locale: 'id',
    mode: 'ai',
    status: 'IN_PROGRESS' as const,
    categoriesCovered: ['intensitas', 'waktu'],
    shareToken: 'token-123',
    metadata: null,
    messages: [
      {
        id: 'msg-1',
        sessionId: 'session-123',
        role: 'assistant',
        content: 'Halo! Ada yang bisa aku bantu?',
        isVoice: false,
        createdAt: new Date('2025-01-01T10:00:00Z'),
      },
      {
        id: 'msg-2',
        sessionId: 'session-123',
        role: 'user',
        content: 'Aku gatal-gatal',
        isVoice: false,
        createdAt: new Date('2025-01-01T10:01:00Z'),
      },
    ],
    demographics: {
      id: 'demo-1',
      sessionId: 'session-123',
      name: 'Santri A',
      age: 14,
      gender: 'male',
      educationLevel: 'JUNIOR_HIGH',
      createdAt: new Date('2025-01-01T10:00:00Z'),
    },
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T10:00:00Z'),
    completedAt: null,
  };

  it('returns session state with mapped messages', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession,
    );

    const result = await getSessionState('session-123');

    expect(result.sessionId).toBe('session-123');
    expect(result.status).toBe('in_progress');
    expect(result.mode).toBe('ai');
    expect(result.locale).toBe('id');
    expect(result.theme).toBe('hybrid');
    expect(result.categoriesCovered).toEqual(['intensitas', 'waktu']);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      role: 'bot',
      content: 'Halo! Ada yang bisa aku bantu?',
      timestamp: '2025-01-01T10:00:00.000Z',
    });
    expect(result.messages[1]).toEqual({
      role: 'user',
      content: 'Aku gatal-gatal',
      timestamp: '2025-01-01T10:01:00.000Z',
    });
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getSessionState('nonexistent-id')).rejects.toThrow('Session not found');
  });

  it('returns currentPills for questionnaire mode in-progress session', async () => {
    const questionnaireSession = {
      ...mockSession,
      mode: 'questionnaire',
      status: 'IN_PROGRESS' as const,
      categoriesCovered: ['intensitas', 'waktu'],
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      questionnaireSession,
    );

    const result = await getSessionState('session-123');

    expect(result.currentPills).not.toBeNull();
    expect(result.currentPills!.pillSelection).toBe('multi');
    expect(result.currentPills!.pills.length).toBeGreaterThan(0);
    // Next uncovered category after intensitas + waktu is lokasi_tubuh
    expect(result.currentPills!.pills[0].id).toBe('lok_finger_webs');
  });

  it('returns null currentPills for AI mode sessions', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession,
    );

    const result = await getSessionState('session-123');

    expect(result.currentPills).toBeNull();
  });

  it('returns null currentPills for completed questionnaire sessions', async () => {
    const completedSession = {
      ...mockSession,
      mode: 'questionnaire',
      status: 'COMPLETED' as const,
      categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      completedAt: new Date('2025-01-01T11:00:00Z'),
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      completedSession,
    );

    const result = await getSessionState('session-123');

    expect(result.status).toBe('completed');
    expect(result.currentPills).toBeNull();
  });

  it('maps COMPLETED status to completed', async () => {
    const completedSession = {
      ...mockSession,
      status: 'COMPLETED' as const,
      completedAt: new Date('2025-01-01T11:00:00Z'),
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      completedSession,
    );

    const result = await getSessionState('session-123');

    expect(result.status).toBe('completed');
  });

  it('derives playful theme for elementary education level', async () => {
    const elementarySession = {
      ...mockSession,
      demographics: {
        ...mockSession.demographics,
        educationLevel: 'ELEMENTARY',
      },
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      elementarySession,
    );

    const result = await getSessionState('session-123');

    expect(result.theme).toBe('playful');
  });

  it('returns null currentPills when all categories are covered in questionnaire mode', async () => {
    const allCoveredSession = {
      ...mockSession,
      mode: 'questionnaire',
      status: 'IN_PROGRESS' as const,
      categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      allCoveredSession,
    );

    const result = await getSessionState('session-123');

    expect(result.currentPills).toBeNull();
  });
});

describe('getResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCompletedSession = {
    id: 'session-result-1',
    locale: 'id',
    mode: 'ai',
    status: 'COMPLETED' as const,
    categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    scores: { intensitas: 3, waktu: 2, lokasi_tubuh: 4, kontak: 2, lesi: 3, faktor_risiko: 1 },
    totalScore: 15,
    riskLevel: 'MODERATE' as const,
    aiConclusion: 'Berdasarkan penilaian, risiko skabies moderat.',
    aiPerceptionResponse: 'Persepsi pengguna cukup baik.',
    aiRecommendation: 'Konsultasi dengan dokter.',
    aiSuggestion: 'Jaga kebersihan lingkungan.',
    shareToken: 'token-result-1',
    metadata: null,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T11:00:00Z'),
    completedAt: new Date('2025-01-01T11:00:00Z'),
    demographics: {
      id: 'demo-result-1',
      sessionId: 'session-result-1',
      name: 'Santri B',
      age: 16,
      gender: 'male',
      educationLevel: 'SENIOR_HIGH',
      createdAt: new Date('2025-01-01T10:00:00Z'),
    },
  };

  it('returns result for a completed AI mode session', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCompletedSession,
    );

    const result = await getResult('session-result-1');

    expect(result.sessionId).toBe('session-result-1');
    expect(result.completedAt).toBe('2025-01-01T11:00:00.000Z');
    expect(result.demographics).toEqual({
      name: 'Santri B',
      age: 16,
      gender: 'male',
      educationLevel: 'senior_high',
    });
    expect(result.totalScore).toBe(15);
    expect(result.riskLevel).toBe('MODERATE');
    expect(result.scores).toEqual({
      intensitas: 3,
      waktu: 2,
      lokasi_tubuh: 4,
      kontak: 2,
      lesi: 3,
      faktor_risiko: 1,
    });
    expect(result.conclusion).toBe('Berdasarkan penilaian, risiko skabies moderat.');
    expect(result.perceptionResponse).toBe('Persepsi pengguna cukup baik.');
    expect(result.recommendation).toBe('Konsultasi dengan dokter.');
    expect(result.personalizedSuggestion).toBe('Jaga kebersihan lingkungan.');
  });

  it('returns null perceptionResponse and personalizedSuggestion for questionnaire mode', async () => {
    const questionnaireSession = {
      ...mockCompletedSession,
      mode: 'questionnaire',
      aiPerceptionResponse: 'Some perception',
      aiSuggestion: 'Some suggestion',
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      questionnaireSession,
    );

    const result = await getResult('session-result-1');

    expect(result.perceptionResponse).toBeNull();
    expect(result.personalizedSuggestion).toBeNull();
    expect(result.conclusion).toBe('Berdasarkan penilaian, risiko skabies moderat.');
    expect(result.recommendation).toBe('Konsultasi dengan dokter.');
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getResult('nonexistent-id')).rejects.toThrow('Session not found');
  });

  it('throws SessionNotFoundError when session is not completed', async () => {
    const inProgressSession = {
      ...mockCompletedSession,
      status: 'IN_PROGRESS' as const,
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      inProgressSession,
    );

    await expect(getResult('session-result-1')).rejects.toThrow('Session not found');
  });

  it('uses updatedAt as fallback when completedAt is null', async () => {
    const sessionNoCompletedAt = {
      ...mockCompletedSession,
      completedAt: null,
      updatedAt: new Date('2025-01-01T12:00:00Z'),
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sessionNoCompletedAt,
    );

    const result = await getResult('session-result-1');

    expect(result.completedAt).toBe('2025-01-01T12:00:00.000Z');
  });

  it('handles null scores and totalScore with defaults', async () => {
    const sessionNullScores = {
      ...mockCompletedSession,
      scores: null,
      totalScore: null,
      riskLevel: null,
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sessionNullScores,
    );

    const result = await getResult('session-result-1');

    expect(result.totalScore).toBe(0);
    expect(result.scores).toEqual({});
    expect(result.riskLevel).toBe('LOW');
  });

  it('handles null AI fields gracefully', async () => {
    const sessionNullAi = {
      ...mockCompletedSession,
      aiConclusion: null,
      aiPerceptionResponse: null,
      aiRecommendation: null,
      aiSuggestion: null,
    };
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sessionNullAi,
    );

    const result = await getResult('session-result-1');

    expect(result.conclusion).toBe('');
    expect(result.perceptionResponse).toBeNull();
    expect(result.recommendation).toBe('');
    expect(result.personalizedSuggestion).toBeNull();
  });
});

describe('verifySessionAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_TOKEN = '660e8400-e29b-41d4-a716-446655440001';

  it('returns verified session for valid token', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_SESSION_ID,
      shareToken: VALID_TOKEN,
      status: 'IN_PROGRESS',
      locale: 'id',
    });
    mockedVerifyShareToken.mockReturnValue(true);

    const result = await verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN);

    expect(result).toEqual({ id: VALID_SESSION_ID, locale: 'id' });
  });

  it('throws InvalidTokenError when token is null', async () => {
    await expect(verifySessionAccess(VALID_SESSION_ID, null)).rejects.toThrow(
      'Invalid or missing token',
    );
  });

  it('throws InvalidTokenError when token is not a UUID', async () => {
    await expect(verifySessionAccess(VALID_SESSION_ID, 'bad-token')).rejects.toThrow(
      'Invalid or missing token',
    );
  });

  it('throws InvalidTokenError when token is empty string', async () => {
    await expect(verifySessionAccess(VALID_SESSION_ID, '')).rejects.toThrow(
      'Invalid or missing token',
    );
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN)).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws SessionNotFoundError when requireCompleted and session not completed', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_SESSION_ID,
      shareToken: VALID_TOKEN,
      status: 'IN_PROGRESS',
      locale: 'id',
    });

    await expect(
      verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN, { requireCompleted: true }),
    ).rejects.toThrow('Session not found');
  });

  it('passes when requireCompleted and session is completed', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_SESSION_ID,
      shareToken: VALID_TOKEN,
      status: 'COMPLETED',
      locale: 'en',
    });
    mockedVerifyShareToken.mockReturnValue(true);

    const result = await verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN, {
      requireCompleted: true,
    });

    expect(result).toEqual({ id: VALID_SESSION_ID, locale: 'en' });
  });

  it('throws InvalidTokenError when token does not match shareToken', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_SESSION_ID,
      shareToken: 'different-stored-token',
      status: 'IN_PROGRESS',
      locale: 'id',
    });
    mockedVerifyShareToken.mockReturnValue(false);

    await expect(verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN)).rejects.toThrow(
      'Invalid or missing token',
    );
  });

  it('throws InvalidTokenError when session has null shareToken', async () => {
    (mockedPrisma.screeningSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_SESSION_ID,
      shareToken: null,
      status: 'IN_PROGRESS',
      locale: 'id',
    });

    await expect(verifySessionAccess(VALID_SESSION_ID, VALID_TOKEN)).rejects.toThrow(
      'Invalid or missing token',
    );
  });
});
