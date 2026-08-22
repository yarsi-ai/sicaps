import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    screeningResult: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    screeningImage: { findUnique: vi.fn() },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    checkpoint: { upsert: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/llm', () => ({
  getPrimaryClient: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
  getLLMConfig: vi.fn(() => ({ model: 'test-model', maxTokensOutput: 100, timeoutMs: 5000 })),
}));

vi.mock('../adapters/llm/prompts', () => ({
  buildResultPrompt: vi.fn(() => [
    { role: 'system', content: 'mock system prompt' },
    { role: 'user', content: '{}' },
  ]),
}));

vi.mock('../adapters/llm/schemas', () => ({
  resultTextSchema: {
    parse: vi.fn((val) => val),
  },
}));

vi.mock('../domain/scoring/engine', () => ({
  calculateRisk: vi.fn(() => ({
    riskLevel: 'MODERATE',
    gejalaCount: 1,
    faktorCount: 1,
    state: {
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: true,
      tukarAlat: false,
    },
  })),
}));

vi.mock('../domain/chat/checkpoint', () => ({
  buildSummary: vi.fn(() => ({
    totalScore: 5,
    riskLevel: 'MODERATE',
    perDimension: { intensitas: { keywords: ['gatal_terus'], score: 3 } },
    perception: 'adequate',
    emosi: null,
  })),
}));

import { prisma } from '@/db/prisma';
import { getPrimaryClient, getLLMConfig } from '@/lib/llm';
import { buildResultPrompt } from '../adapters/llm/prompts';
import { resultTextSchema } from '../adapters/llm/schemas';
import {
  advancePhaseAfterImage,
  createSession,
  getSessionState,
  getResult,
  finalize,
  resumeSession,
  generateResultText,
} from './screening.service';

const mockSessionCreate = vi.mocked(prisma.screeningSession.create);
const mockSessionFindUnique = vi.mocked(prisma.screeningSession.findUnique);
const mockSessionFindUniqueOrThrow = vi.mocked(prisma.screeningSession.findUniqueOrThrow);
const mockSessionUpdate = vi.mocked(prisma.screeningSession.update);
const mockResultFindUnique = vi.mocked(prisma.screeningResult.findUnique);
const mockResultUpsert = vi.mocked(prisma.screeningResult.upsert);
const mockResultUpdate = vi.mocked(prisma.screeningResult.update);
const mockImageFindUnique = vi.mocked(prisma.screeningImage.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockCheckpointUpsert = vi.mocked(prisma.checkpoint.upsert);
const mockAuditLogCreate = vi.mocked(prisma.auditLog.create);
const mockMessageCreate = vi.mocked(prisma.chatMessage.create);
const mockMessageFindMany = vi.mocked(prisma.chatMessage.findMany);
const mockGetPrimaryClient = vi.mocked(getPrimaryClient);
const mockGetLLMConfig = vi.mocked(getLLMConfig);
const _mockBuildResultPrompt = vi.mocked(buildResultPrompt);
const mockResultTextSchemaParse = vi.mocked(resultTextSchema.parse);

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session with correct defaults and returns sessionId and phase GREETING', async () => {
    mockSessionCreate.mockResolvedValue({
      id: SESSION_ID,
      phase: 'GREETING',
    } as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
    mockMessageCreate.mockResolvedValue({} as never);

    const result = await createSession({ locale: 'id' });

    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.openingMessages.length).toBeGreaterThan(0);
    expect(result.openingMessages[0]?.length).toBeGreaterThan(0);
    expect(result.phase).toBe('GREETING');

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locale: 'id',
          mode: 'ai',
          phase: 'GREETING',
          dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        }),
        select: { id: true, phase: true },
      }),
    );

    // expiresAt should be set (24h from now)
    const callData = mockSessionCreate.mock.calls[0][0].data;
    expect(callData.expiresAt).toBeInstanceOf(Date);
    const expiresIn = (callData.expiresAt as Date).getTime() - Date.now();
    // Should be roughly 24h (within 5 seconds tolerance)
    expect(expiresIn).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000);
    expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('logs session_created audit event', async () => {
    mockSessionCreate.mockResolvedValue({ id: SESSION_ID, phase: 'GREETING' } as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
    mockMessageCreate.mockResolvedValue({} as never);

    await createSession({ locale: 'en', mode: 'ai' });

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        event: 'session_created',
        detail: { locale: 'en', mode: 'ai' },
      },
    });
  });

  it('uses defaults when locale and mode are not provided', async () => {
    mockSessionCreate.mockResolvedValue({ id: SESSION_ID, phase: 'GREETING' } as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
    mockMessageCreate.mockResolvedValue({} as never);

    await createSession({});

    const callData = mockSessionCreate.mock.calls[0][0].data;
    expect(callData.locale).toBe('id');
    expect(callData.mode).toBe('ai');
  });
});

describe('getSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session state when found', async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      phase: 'COLLECTING',
      status: 'IN_PROGRESS',
      turnCount: 3,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      hasilDitampilkan: false,
      partial: false,
      expiresAt,
    } as never);

    const result = await getSessionState(SESSION_ID);

    expect(result).toEqual({
      sessionId: SESSION_ID,
      phase: 'COLLECTING',
      status: 'IN_PROGRESS',
      turnCount: 3,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      hasilDitampilkan: false,
      partial: false,
      expiresAt,
    });
  });

  it('returns null when session not found', async () => {
    mockSessionFindUnique.mockResolvedValue(null);

    const result = await getSessionState('non-existent-id');

    expect(result).toBeNull();
  });
});

describe('getResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns result for session using findUnique', async () => {
    mockResultFindUnique.mockResolvedValue({
      riskLevel: 'MODERATE',
      gejalaCount: 1,
      faktorCount: 1,
      scoringState: {
        gatalMalam: true,
        kontakSerupa: false,
        lokasiKhas: false,
        asrama: true,
        tukarAlat: false,
      },
      perception: 'ADEQUATE',
      partial: false,
    } as never);

    const result = await getResult(SESSION_ID);

    expect(result).toEqual({
      riskLevel: 'MODERATE',
      gejalaCount: 1,
      faktorCount: 1,
      scoringState: {
        gatalMalam: true,
        kontakSerupa: false,
        lokasiKhas: false,
        asrama: true,
        tukarAlat: false,
      },
      perception: 'ADEQUATE',
      partial: false,
      edukasi: [
        'Perlu menjaga kebersihan diri dan kamar',
        'Jangan menukar atau meminjam barang pribadi (handuk, baju, sarung)',
        'Jika dalam 3 hari tidak membaik, temui kader atau dokter',
      ],
      aiConclusion: null,
      aiPerceptionResponse: null,
      aiRecommendation: null,
      aiSuggestion: null,
      // Visual detection fields (added in visual-detection feature)
      visualResult: null,
      finalOutput: null,
      visualPredictionFailed: false,
    });

    expect(mockResultFindUnique).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
    });
  });

  it('returns null when no result exists', async () => {
    mockResultFindUnique.mockResolvedValue(null);

    const result = await getResult(SESSION_ID);

    expect(result).toBeNull();
  });
});

describe('finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts single result, creates checkpoint, and logs finalize', async () => {
    // Session with scoring booleans
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: true,
      tukarAlat: false,
    } as never);

    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);

    const result = await finalize(SESSION_ID);

    // Returns correct result shape (no revision, no totalScore)
    expect(result.riskLevel).toBe('MODERATE');
    expect(result.gejalaCount).toBe(1);
    expect(result.faktorCount).toBe(1);
    expect(result).not.toHaveProperty('revision');
    expect(result).not.toHaveProperty('totalScore');

    // Upserts ScreeningResult (no revision field)
    expect(mockResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID },
        create: expect.objectContaining({
          sessionId: SESSION_ID,
          riskLevel: 'MODERATE',
          gejalaCount: 1,
          faktorCount: 1,
        }),
        update: expect.objectContaining({
          riskLevel: 'MODERATE',
          gejalaCount: 1,
          faktorCount: 1,
        }),
      }),
    );

    // Upserts checkpoint
    expect(mockCheckpointUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID },
        create: expect.objectContaining({
          sessionId: SESSION_ID,
        }),
      }),
    );

    // Logs 'finalize' (never 'rescore' — revision system removed)
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        event: 'finalize',
        detail: expect.objectContaining({
          gejalaCount: 1,
          faktorCount: 1,
          riskLevel: 'MODERATE',
        }),
      }),
    });
  });

  it('updates session to SCREENING_COMPLETE and COMPLETED', async () => {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: [],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: false,
      tukarAlat: false,
    } as never);
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);

    await finalize(SESSION_ID);

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        hasilDitampilkan: true,
        phase: 'SCREENING_COMPLETE',
        status: 'COMPLETED',
      },
    });
  });
});

describe('resumeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns state when session is IN_PROGRESS and not expired', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      status: 'IN_PROGRESS',
      phase: 'COLLECTING',
      turnCount: 5,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      expiresAt: futureExpiry,
    } as never);
    mockMessageFindMany.mockResolvedValue([
      { role: 'assistant', content: 'Hai!', createdAt: new Date('2024-01-01T00:00:00Z') },
      { role: 'user', content: 'Gatal banget', createdAt: new Date('2024-01-01T00:01:00Z') },
    ] as never);

    const result = await resumeSession(SESSION_ID);

    expect(result).toEqual({
      sessionId: SESSION_ID,
      phase: 'COLLECTING',
      turnCount: 5,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      messages: [
        { role: 'assistant', content: 'Hai!', timestamp: '2024-01-01T00:00:00.000Z' },
        { role: 'user', content: 'Gatal banget', timestamp: '2024-01-01T00:01:00.000Z' },
      ],
    });
  });

  it('returns null when expiresAt is past', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      status: 'IN_PROGRESS',
      phase: 'COLLECTING',
      turnCount: 5,
      dimensiTerisi: {},
      dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      expiresAt: pastExpiry,
    } as never);

    const result = await resumeSession(SESSION_ID);

    expect(result).toBeNull();
  });

  it('returns null when status is COMPLETED', async () => {
    mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
      phase: 'SCREENING_COMPLETE',
      turnCount: 10,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never);

    const result = await resumeSession(SESSION_ID);

    expect(result).toBeNull();
  });

  it('returns null when session not found', async () => {
    mockSessionFindUnique.mockResolvedValue(null);

    const result = await resumeSession('non-existent-id');

    expect(result).toBeNull();
  });
});

describe('finalize — no revision system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates single result without revision field', async () => {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: [],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: true,
      kontakSerupa: true,
      lokasiKhas: false,
      asrama: false,
      tukarAlat: false,
    } as never);
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);

    const result = await finalize(SESSION_ID);

    // Result uses binary scoring — gejalaCount and faktorCount
    expect(result.riskLevel).toBe('MODERATE');
    expect(result.gejalaCount).toBeDefined();
    expect(result.faktorCount).toBeDefined();

    // NO revision field in result
    expect(result).not.toHaveProperty('revision');
    expect(result).not.toHaveProperty('totalScore');

    // Upsert uses sessionId as unique key (no revision)
    expect(mockResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID },
      }),
    );
  });

  it('does not recalculate scoring in repeated calls (idempotent upsert)', async () => {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: {},
      dimensiBelum: [],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: false,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: false,
      tukarAlat: false,
    } as never);
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);

    // Call finalize twice
    await finalize(SESSION_ID);
    await finalize(SESSION_ID);

    // Both calls upsert with the same sessionId key — no new revision created
    const upsertCalls = mockResultUpsert.mock.calls;
    expect(upsertCalls.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((upsertCalls[0][0] as any).where).toEqual({ sessionId: SESSION_ID });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((upsertCalls[1][0] as any).where).toEqual({ sessionId: SESSION_ID });
  });

  it('returns ResultResponse with scoringState snapshot', async () => {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: {},
      dimensiBelum: [],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: true,
      asrama: true,
      tukarAlat: false,
    } as never);
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);

    const result = await finalize(SESSION_ID);

    // Should contain scoringState as object with 5 booleans
    expect(result.scoringState).toBeDefined();
    expect(typeof result.scoringState).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// generateResultText tests (TDD — Task 6)
// ---------------------------------------------------------------------------

describe('generateResultText', () => {
  const VALID_LLM_RESPONSE = {
    conclusion: 'Berdasarkan gejala yang kamu alami, ada risiko sedang terkena skabies.',
    perceptionResponse: 'Wajar kok kalau khawatir, tapi ini bisa ditangani dengan baik.',
    recommendation:
      'Temui kader kesehatan untuk pemeriksaan\nJaga kebersihan handuk dan sprei\nJangan tukar barang pribadi',
    suggestion: 'Kamu bisa mulai dari konsultasi ke kader santri yang lebih nyaman dan dekat.',
  };

  function createMockLLMClient(
    responseContent: string | null = JSON.stringify(VALID_LLM_RESPONSE),
  ) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: responseContent } }],
          }),
        },
      },
    };
  }

  function setupSessionMock() {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      locale: 'id',
      dimensiTerisi: { intensitas: { keywords: ['gatal_terus'], negasi: [] } },
      dimensiBelum: ['waktu'],
      perception: 'ADEQUATE',
      partial: false,
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: true,
      tukarAlat: false,
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupSessionMock();
    mockResultUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
    mockResultTextSchemaParse.mockImplementation((val) => val as never);
  });

  it('calls LLM with temperature 0.3 and the configured output token budget', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        max_tokens: 500,
      }),
    );
  });

  it('requests JSON mode so the response is parseable', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('forwards reasoning_effort when configured', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
      reasoningEffort: 'low',
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning_effort: 'low' }),
    );
  });

  it('omits reasoning_effort when unconfigured', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    const params = mockClient.chat.completions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect('reasoning_effort' in params).toBe(false);
  });

  it('on a truncated response → retries with a wider token budget', async () => {
    const mockClient = createMockLLMClient();
    mockClient.chat.completions.create
      .mockResolvedValueOnce({
        choices: [{ finish_reason: 'length', message: { content: '{"conclusion":"cut off' } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
      });
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    expect(mockClient.chat.completions.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ max_tokens: 1000 }),
    );
    expect(mockResultUpdate).toHaveBeenCalled();
  });

  it('never persists a truncated response', async () => {
    const mockClient = createMockLLMClient();
    mockClient.chat.completions.create.mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '{"conclusion":"cut off' } }],
    });
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockResultUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: expect.stringContaining('result_text_generation_failed'),
      }),
    });
  });

  it('on valid response → updates ScreeningResult with AI fields', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    expect(mockResultUpdate).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      data: {
        aiConclusion: VALID_LLM_RESPONSE.conclusion,
        aiPerceptionResponse: VALID_LLM_RESPONSE.perceptionResponse,
        aiRecommendation: VALID_LLM_RESPONSE.recommendation,
        aiSuggestion: VALID_LLM_RESPONSE.suggestion,
      },
    });
  });

  it('on LLM error → retries 1x', async () => {
    const mockClient = createMockLLMClient();
    // First call fails, second succeeds
    mockClient.chat.completions.create
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
      });
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    await generateResultText(SESSION_ID);

    // LLM was called twice (original + 1 retry)
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    // Result was still updated successfully on retry
    expect(mockResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID },
        data: expect.objectContaining({
          aiConclusion: VALID_LLM_RESPONSE.conclusion,
        }),
      }),
    );
  });

  it('on second failure → logs to AuditLog, does NOT throw', async () => {
    const mockClient = createMockLLMClient();
    // Both calls fail
    mockClient.chat.completions.create
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockRejectedValueOnce(new Error('LLM timeout again'));
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    // Should NOT throw
    await expect(generateResultText(SESSION_ID)).resolves.toBeUndefined();

    // Should log to AuditLog
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: SESSION_ID,
        event: expect.stringContaining('result_text_generation_failed'),
      }),
    });

    // Should NOT update ScreeningResult
    expect(mockResultUpdate).not.toHaveBeenCalled();
  });

  it('on Zod validation failure → retries 1x', async () => {
    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    // First parse fails (Zod error), second succeeds
    mockResultTextSchemaParse
      .mockImplementationOnce(() => {
        throw new Error('Zod validation failed');
      })
      .mockImplementationOnce((val) => val as never);

    await generateResultText(SESSION_ID);

    // LLM was called twice (original + 1 retry after Zod failure)
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    // Result was updated successfully on retry
    expect(mockResultUpdate).toHaveBeenCalled();
  });

  it('skips LLM call and returns early when aiConclusion already exists (idempotent — runs once per session)', async () => {
    mockResultFindUnique.mockResolvedValue({ aiConclusion: 'already generated' } as never);

    const mockClient = createMockLLMClient();
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    await generateResultText(SESSION_ID);

    // LLM must NOT be called — analysis already happened
    expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
    // Session data must NOT even be loaded — early return happens before that
    expect(mockSessionFindUniqueOrThrow).not.toHaveBeenCalled();
    // No update or audit log write either
    expect(mockResultUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('does not block finalize flow (fire-and-forget pattern)', async () => {
    // Create a long-running LLM call that simulates delay
    const mockClient = createMockLLMClient();
    mockClient.chat.completions.create.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
              }),
            100,
          ),
        ),
    );
    mockGetPrimaryClient.mockReturnValue(mockClient as never);
    mockGetLLMConfig.mockReturnValue({
      model: 'test-model',
      maxTokensOutput: 500,
      timeoutMs: 5000,
    } as never);

    // Setup finalize mocks
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);

    // finalize() should return immediately without awaiting generateResultText
    const result = await finalize(SESSION_ID);

    // finalize returns result instantly (fire-and-forget)
    expect(result.riskLevel).toBeDefined();

    // The LLM call might not have completed yet — that's the point of fire-and-forget
    // Wait for the async operation to complete for cleanup
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
});

/**
 * The image gate normally sits at SCREENING_COMPLETE, so `submitImage` writes the
 * combination onto an existing ScreeningResult. But the photo can also arrive
 * first — the gate position is configurable for testing, and a session can be
 * finalised afterwards. Both orders must end up with the same stored result.
 */
describe('finalize — visual detection ordering', () => {
  const SESSION_ID = 'session-ordering';

  function arrangeSession(): void {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      id: SESSION_ID,
      dimensiTerisi: {},
      dimensiBelum: [],
      perception: 'adequate',
      partial: false,
      metadata: null,
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: false,
      asrama: true,
      tukarAlat: false,
    } as never);
    mockResultUpsert.mockResolvedValue({} as never);
    mockCheckpointUpsert.mockResolvedValue({} as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    arrangeSession();
  });

  it('leaves the visual fields unset when no image has been submitted', async () => {
    mockImageFindUnique.mockResolvedValue(null as never);

    const result = await finalize(SESSION_ID);

    expect(result.visualResult).toBeNull();
    expect(result.finalOutput).toBeNull();
    expect(result.visualPredictionFailed).toBe(false);

    const call = mockResultUpsert.mock.calls[0]?.[0] as { create: Record<string, unknown> };
    expect(call.create).not.toHaveProperty('visualResult');
    expect(call.create).not.toHaveProperty('finalOutput');
  });

  it('leaves the visual fields unset while a submitted image has no result yet', async () => {
    mockImageFindUnique.mockResolvedValue({
      visualResult: null,
      predictionFailed: false,
    } as never);

    const result = await finalize(SESSION_ID);

    expect(result.visualResult).toBeNull();
    expect(result.finalOutput).toBeNull();
  });

  it('folds an earlier visual result into the stored result', async () => {
    // calculateRisk is mocked to MODERATE; MODERATE + POSITIVE => SUSPECTED_SCABIES
    mockImageFindUnique.mockResolvedValue({
      visualResult: 'POSITIVE',
      predictionFailed: false,
    } as never);

    const result = await finalize(SESSION_ID);

    expect(result.visualResult).toBe('POSITIVE');
    expect(result.finalOutput).toBe('SUSPECTED_SCABIES');
    expect(result.visualPredictionFailed).toBe(false);

    expect(mockResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          visualResult: 'POSITIVE',
          finalOutput: 'SUSPECTED_SCABIES',
          visualPredictionFailed: false,
        }),
        update: expect.objectContaining({
          visualResult: 'POSITIVE',
          finalOutput: 'SUSPECTED_SCABIES',
          visualPredictionFailed: false,
        }),
      }),
    );
  });

  it('combines a NEGATIVE visual result into NOT_SCABIES at MODERATE risk', async () => {
    mockImageFindUnique.mockResolvedValue({
      visualResult: 'NEGATIVE',
      predictionFailed: false,
    } as never);

    const result = await finalize(SESSION_ID);

    expect(result.finalOutput).toBe('NOT_SCABIES');
  });

  it('carries the permanent-failure flag through from the image row', async () => {
    mockImageFindUnique.mockResolvedValue({
      visualResult: 'NEGATIVE',
      predictionFailed: true,
    } as never);

    const result = await finalize(SESSION_ID);

    expect(result.visualPredictionFailed).toBe(true);
    expect(result.visualResult).toBe('NEGATIVE');
    expect(result.finalOutput).toBe('NOT_SCABIES');
  });
});

/**
 * The opening messages are the santri's first sight of the bot, and they are
 * also the transcript's first rows. They are written server-side so the two can
 * never disagree — the client used to hold its own copy of the greeting.
 */
describe('createSession — opening messages', () => {
  const SESSION_ID = 'session-opening';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionCreate.mockResolvedValue({ id: SESSION_ID, phase: 'GREETING' } as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
    mockTransaction.mockResolvedValue([] as never);
  });

  it('persists every opening message it returns', async () => {
    const result = await createSession({ locale: 'id' });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate).toHaveBeenCalledTimes(result.openingMessages.length);
  });

  it('writes them as bot turns', async () => {
    await createSession({ locale: 'id' });

    for (const call of mockMessageCreate.mock.calls) {
      const { data } = call[0] as { data: Record<string, unknown> };
      expect(data.role).toBe('assistant');
      expect(data.sessionId).toBe(SESSION_ID);
    }
  });

  it('stamps them with increasing timestamps so their order is fixed', async () => {
    await createSession({ locale: 'id' });

    const times = mockMessageCreate.mock.calls.map((call) =>
      ((call[0] as { data: { createdAt: Date } }).data.createdAt as Date).getTime(),
    );

    // Inside a transaction Postgres' now() is identical for every row, so
    // relying on the column default would leave the order undefined.
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1] as number);
    }
  });

  it('returns the same strings it persisted', async () => {
    const result = await createSession({ locale: 'id' });

    const persisted = mockMessageCreate.mock.calls.map(
      (call) => (call[0] as { data: { content: string } }).data.content,
    );

    expect(persisted).toEqual(result.openingMessages);
  });

  it('asks for the photo up front only when the gate opens at the start', async () => {
    const result = await createSession({ locale: 'id' });

    // The switch is off by default, so the session opens with the greeting alone
    // and the photo request rides along with screeningComplete instead.
    expect(result.openingMessages).toHaveLength(1);
  });
});

/**
 * An upload is not a chat turn, so `processChatTurn` never runs its transition
 * path for it. This is the equivalent entry point out of AWAITING_IMAGE, and it
 * reuses the same `nextPhase` so the gate cannot drift from the machine.
 */
describe('advancePhaseAfterImage', () => {
  const SESSION_ID = 'session-gate';

  /** A session sitting in the gate with everything else already collected. */
  function arrangeParkedSession(overrides: Record<string, unknown> = {}): void {
    mockSessionFindUniqueOrThrow.mockResolvedValue({
      locale: 'id',
      phase: 'AWAITING_IMAGE',
      dimensiBelum: [],
      perception: null,
      hasilDitampilkan: false,
      turnCount: 8,
      partial: false,
      chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
      stagnationCount: 0,
      ...overrides,
    } as never);
    mockSessionUpdate.mockResolvedValue({} as never);
    mockAuditLogCreate.mockResolvedValue({} as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves a parked session to ASKING_PERCEPTION', async () => {
    arrangeParkedSession();

    const result = await advancePhaseAfterImage(SESSION_ID);

    expect(result.phase).toBe('ASKING_PERCEPTION');
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        phase: 'ASKING_PERCEPTION',
        // Asking is recorded, not just returned. The next chat turn reads this to
        // know the santri's reply answers the severity question.
        perceptionStep: 'ASK_SEVERITY',
        perceptionStartTurn: 8,
      },
    });
  });

  it('returns the perception question, because no chat turn follows the upload', async () => {
    arrangeParkedSession();

    const result = await advancePhaseAfterImage(SESSION_ID);

    expect(result.followUpMessage).toContain('menurut kamu');
  });

  it('holds the question back and records nothing asked when the caller suppresses it', async () => {
    // The photo turn already ends in a question of its own, so the perception
    // question would be a second question in one turn. Claiming to have asked it
    // is worse than not asking: the next turn would score an unrelated reply as
    // a perception answer.
    arrangeParkedSession();

    const result = await advancePhaseAfterImage(SESSION_ID, { suppressFollowUp: true });

    expect(result.phase).toBe('ASKING_PERCEPTION');
    expect(result.followUpMessage).toBeNull();
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { phase: 'ASKING_PERCEPTION' },
    });
  });

  it('returns the English question for an English session', async () => {
    arrangeParkedSession({ locale: 'en' });

    const result = await advancePhaseAfterImage(SESSION_ID);

    expect(result.followUpMessage).toContain('how would you describe this itching');
  });

  it('logs the transition with the trigger that caused it', async () => {
    arrangeParkedSession();

    await advancePhaseAfterImage(SESSION_ID);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        event: 'phase_transition',
        detail: { from: 'AWAITING_IMAGE', to: 'ASKING_PERCEPTION', trigger: 'image_submitted' },
      },
    });
  });

  it('skips SCREENING_COMPLETE straight to it when perception is already known', async () => {
    arrangeParkedSession({ perception: 'adequate' });

    const result = await advancePhaseAfterImage(SESSION_ID);

    // Nothing owes a question here, so the transcript gains no extra row.
    expect(result.phase).toBe('SCREENING_COMPLETE');
    expect(result.followUpMessage).toBeNull();
  });

  it('writes nothing when the phase does not move', async () => {
    // Dimensions still missing, so the machine sends it back to COLLECTING —
    // which is where a gate-at-start session already is.
    arrangeParkedSession({ phase: 'COLLECTING', dimensiBelum: ['lesi'] });

    const result = await advancePhaseAfterImage(SESSION_ID);

    expect(result).toEqual({ phase: 'COLLECTING', followUpMessage: null });
    expect(mockSessionUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});
