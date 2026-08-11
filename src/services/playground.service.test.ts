// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    turnLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/llm', () => ({
  createLLMClient: vi.fn(),
}));

vi.mock('@/features/screening-chat-v1/internal', () => ({
  parseLLMResponse: vi.fn(),
  extractReplyFromPartial: vi.fn(),
  appendToPool: vi.fn(),
  calculateAllScores: vi.fn(),
}));

vi.mock('@/lib/llm/playground-client', () => ({
  resolveProviderConfig: vi.fn(),
  getProviderEnvVar: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({
    PLAYGROUND_GROQ_KEY: 'gsk_test_key',
    PLAYGROUND_HF_KEY: undefined,
    PLAYGROUND_GEMINI_KEY: undefined,
    PLAYGROUND_OLLAMA_URL: undefined,
  })),
}));

import { prisma } from '@/db/prisma';
import { createLLMClient } from '@/lib/llm';
import {
  parseLLMResponse,
  appendToPool,
  calculateAllScores,
} from '@/features/screening-chat-v1/internal';
import { resolveProviderConfig, getProviderEnvVar } from '@/lib/llm/playground-client';
import {
  processPlaygroundChat,
  computePlaygroundScoring,
  persistTurnLog,
  type PlaygroundConfig,
  type PlaygroundOptions,
} from './playground.service';
import type {
  CategoryExtraction,
  ScoringResult,
  KeywordPool,
} from '@/features/screening-chat-v1/internal';

const mockedCreateLLMClient = vi.mocked(createLLMClient);
const mockedParseLLMResponse = vi.mocked(parseLLMResponse);
const mockedResolveProviderConfig = vi.mocked(resolveProviderConfig);
const mockedGetProviderEnvVar = vi.mocked(getProviderEnvVar);
const mockedAppendToPool = vi.mocked(appendToPool);
const mockedCalculateAllScores = vi.mocked(calculateAllScores);
const mockedPrisma = vi.mocked(prisma, { deep: true });

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseConfig: PlaygroundConfig = {
  provider: 'groq',
  model: 'llama-3.1-8b-instant',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  systemPrompt: 'You are a screening assistant.',
};

const baseOptions: PlaygroundOptions = {
  enableScoring: false,
  locale: 'id',
  mode: 'single-shot',
};

const baseMessages = [{ role: 'user' as const, content: 'Saya merasa gatal' }];

const validExtraction: CategoryExtraction = {
  intensitas: [{ keyword: 'gatal', confidence: 'high' }],
  waktu: [],
  lokasi_tubuh: [],
  kontak: [],
  lesi: [],
  faktor_risiko: [],
};

const mockScoringResult: ScoringResult = {
  version: 'v1',
  scores: {
    intensitas: {
      raw: 1,
      capped: 1,
      status: 'assessed',
      matchedPatterns: ['gatal'],
      unmatchedKeywords: [],
    },
    waktu: {
      raw: 0,
      capped: 0,
      status: 'not_assessed',
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    lokasi_tubuh: {
      raw: 0,
      capped: 0,
      status: 'not_assessed',
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    kontak: {
      raw: 0,
      capped: 0,
      status: 'not_assessed',
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    lesi: { raw: 0, capped: 0, status: 'not_assessed', matchedPatterns: [], unmatchedKeywords: [] },
    faktor_risiko: {
      raw: 0,
      capped: 0,
      status: 'not_assessed',
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
  },
  totalScore: 1,
  riskLevel: 'LOW',
};

const poolWithEntries: KeywordPool = {
  intensitas: [
    { keyword: 'gatal', confidence: 'high', turn: 1, matched: false, matchedPattern: null },
  ],
  waktu: [],
  lokasi_tubuh: [],
  kontak: [],
  lesi: [],
  faktor_risiko: [],
};

// ─── Setup ───────────────────────────────────────────────────────────────────

function setupHappyPath() {
  mockedResolveProviderConfig.mockReturnValue({
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: 'gsk_test_key',
  });

  const mockCreate = vi.fn().mockResolvedValue({
    choices: [
      { message: { content: JSON.stringify({ reply: 'Halo', extraction: validExtraction }) } },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 30 },
  });
  mockedCreateLLMClient.mockReturnValue({
    chat: { completions: { create: mockCreate } },
  } as unknown as ReturnType<typeof createLLMClient>);

  mockedParseLLMResponse.mockReturnValue({
    status: 'success',
    data: {
      reply: 'Halo',
      extraction: validExtraction,
      categories_covered: ['intensitas'],
      next_category: 'waktu',
      should_follow_up: true,
    },
  });

  mockedAppendToPool.mockReturnValue(poolWithEntries);
  mockedCalculateAllScores.mockReturnValue(mockScoringResult);

  mockedPrisma.screeningSession.create.mockResolvedValue({
    id: 'session-123',
    source: 'playground',
    locale: 'id',
    mode: 'ai',
    status: 'IN_PROGRESS',
    categoriesCovered: [],
    scores: null,
    totalScore: null,
    riskLevel: null,
    perception: null,
    aiConclusion: null,
    aiPerceptionResponse: null,
    aiRecommendation: null,
    aiSuggestion: null,
    shareToken: null,
    promptVersion: 'playground',
    scoringVersion: 'v1',
    createdAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    deletedAt: null,
    metadata: null,
  });

  mockedPrisma.turnLog.create.mockResolvedValue({} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── computePlaygroundScoring ────────────────────────────────────────────────

describe('computePlaygroundScoring', () => {
  beforeEach(() => {
    mockedAppendToPool.mockReturnValue(poolWithEntries);
    mockedCalculateAllScores.mockReturnValue(mockScoringResult);
  });

  it('returns null when enableScoring is false', () => {
    const result = computePlaygroundScoring(validExtraction, false, 'id');
    expect(result).toBeNull();
    expect(mockedCalculateAllScores).not.toHaveBeenCalled();
  });

  it('returns null when extraction is null', () => {
    const result = computePlaygroundScoring(null, true, 'id');
    expect(result).toBeNull();
    expect(mockedCalculateAllScores).not.toHaveBeenCalled();
  });

  it('returns scoring result when enabled and extraction valid', () => {
    const result = computePlaygroundScoring(validExtraction, true, 'id');
    expect(result).toEqual(mockScoringResult);
    expect(mockedAppendToPool).toHaveBeenCalledWith(
      expect.objectContaining({ intensitas: [], waktu: [] }),
      validExtraction,
      1,
    );
    expect(mockedCalculateAllScores).toHaveBeenCalledWith(poolWithEntries, 'id');
  });

  it('passes locale to calculateAllScores', () => {
    computePlaygroundScoring(validExtraction, true, 'en');
    expect(mockedCalculateAllScores).toHaveBeenCalledWith(poolWithEntries, 'en');
  });
});

// ─── processPlaygroundChat ───────────────────────────────────────────────────

describe('processPlaygroundChat', () => {
  describe('happy path', () => {
    beforeEach(setupHappyPath);

    it('returns correct response shape', async () => {
      const result = await processPlaygroundChat(baseConfig, baseMessages, baseOptions);

      expect(result).toMatchObject({
        reply: 'Halo',
        extraction: validExtraction,
        scoring: null,
        metadata: {
          model: 'llama-3.1-8b-instant',
          provider: 'groq',
          tokensUsed: { input: 50, output: 30 },
        },
        sessionId: 'session-123',
        turnNumber: 1,
      });
      expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('creates LLM client with resolved provider config', async () => {
      await processPlaygroundChat(baseConfig, baseMessages, baseOptions);

      expect(mockedCreateLLMClient).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1',
        'gsk_test_key',
      );
    });

    it('calls LLM with correct parameters', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      mockedCreateLLMClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as unknown as ReturnType<typeof createLLMClient>);

      await processPlaygroundChat(baseConfig, baseMessages, baseOptions);

      expect(mockCreate).toHaveBeenCalledWith(
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'You are a screening assistant.' },
            { role: 'user', content: 'Saya merasa gatal' },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.9,
          response_format: { type: 'json_object' },
        },
        { timeout: 30_000 },
      );
    });

    it('persists TurnLog with playground metadata', async () => {
      await processPlaygroundChat(baseConfig, baseMessages, baseOptions);
      await vi.waitFor(() => {
        expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
      });

      expect(mockedPrisma.turnLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-123',
          turnNumber: 1,
          userMessage: 'Saya merasa gatal',
          parseStatus: 'SUCCESS',
          model: 'llama-3.1-8b-instant',
          promptVersion: 'playground',
          retryCount: 0,
          metadata: expect.objectContaining({
            source: 'playground',
            provider: 'groq',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2048,
            mode: 'single-shot',
          }),
        }),
      });
    });
  });

  describe('provider not configured', () => {
    it('throws AppError(400) with PROVIDER_NOT_CONFIGURED code', async () => {
      mockedResolveProviderConfig.mockReturnValue(null);
      mockedGetProviderEnvVar.mockReturnValue('PLAYGROUND_GROQ_KEY');

      await expect(
        processPlaygroundChat(baseConfig, baseMessages, baseOptions),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Provider groq not configured. Add PLAYGROUND_GROQ_KEY to .env',
      });
    });

    it('does not create session when provider not configured', async () => {
      mockedResolveProviderConfig.mockReturnValue(null);
      mockedGetProviderEnvVar.mockReturnValue('PLAYGROUND_GROQ_KEY');

      await expect(processPlaygroundChat(baseConfig, baseMessages, baseOptions)).rejects.toThrow();

      expect(mockedPrisma.screeningSession.create).not.toHaveBeenCalled();
    });
  });

  describe('LLM errors', () => {
    beforeEach(() => {
      mockedResolveProviderConfig.mockReturnValue({
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk_test_key',
      });
      mockedPrisma.screeningSession.create.mockResolvedValue({
        id: 'session-err',
        source: 'playground',
        locale: 'id',
        mode: 'ai',
        status: 'IN_PROGRESS',
        categoriesCovered: [],
        scores: null,
        totalScore: null,
        riskLevel: null,
        perception: null,
        aiConclusion: null,
        aiPerceptionResponse: null,
        aiRecommendation: null,
        aiSuggestion: null,
        shareToken: null,
        promptVersion: 'playground',
        scoringVersion: 'v1',
        createdAt: new Date(),
        completedAt: null,
        updatedAt: new Date(),
        deletedAt: null,
        metadata: null,
      });
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);
    });

    it('propagates timeout error from LLM client', async () => {
      const err = new Error('Request timed out');
      mockedCreateLLMClient.mockReturnValue({
        chat: { completions: { create: vi.fn().mockRejectedValue(err) } },
      } as unknown as ReturnType<typeof createLLMClient>);

      await expect(
        processPlaygroundChat(baseConfig, baseMessages, baseOptions),
      ).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
    });

    it('propagates HTTP errors from LLM provider', async () => {
      const err = new Error('401 Unauthorized');
      mockedCreateLLMClient.mockReturnValue({
        chat: { completions: { create: vi.fn().mockRejectedValue(err) } },
      } as unknown as ReturnType<typeof createLLMClient>);

      await expect(
        processPlaygroundChat(baseConfig, baseMessages, baseOptions),
      ).rejects.toMatchObject({ code: 'LLM_ERROR' });
    });
  });

  describe('scoring toggle', () => {
    beforeEach(setupHappyPath);

    it('includes scoring when enableScoring=true and extraction valid', async () => {
      const result = await processPlaygroundChat(baseConfig, baseMessages, {
        ...baseOptions,
        enableScoring: true,
      });
      expect(result.scoring).toEqual(mockScoringResult);
    });

    it('returns scoring=null when enableScoring=false', async () => {
      const result = await processPlaygroundChat(baseConfig, baseMessages, baseOptions);
      expect(result.scoring).toBeNull();
      expect(mockedCalculateAllScores).not.toHaveBeenCalled();
    });

    it('returns scoring=null when extraction fails', async () => {
      mockedParseLLMResponse.mockReturnValue({ status: 'partial', reply: 'Partial' });
      const result = await processPlaygroundChat(baseConfig, baseMessages, {
        ...baseOptions,
        enableScoring: true,
      });
      expect(result.scoring).toBeNull();
    });
  });

  describe('multi-turn session', () => {
    beforeEach(() => {
      mockedResolveProviderConfig.mockReturnValue({
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk_test_key',
      });
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          { message: { content: JSON.stringify({ reply: 'OK', extraction: validExtraction }) } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      mockedCreateLLMClient.mockReturnValue({
        chat: { completions: { create: mockCreate } },
      } as unknown as ReturnType<typeof createLLMClient>);
      mockedParseLLMResponse.mockReturnValue({
        status: 'success',
        data: {
          reply: 'OK',
          extraction: validExtraction,
          categories_covered: [],
          next_category: 'intensitas',
          should_follow_up: true,
        },
      });
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);
    });

    it('reuses existing session and increments turn number', async () => {
      mockedPrisma.screeningSession.findUnique.mockResolvedValue({
        id: 'existing-session',
        source: 'playground',
        status: 'IN_PROGRESS',
        locale: 'id',
        mode: 'ai',
        turnLogs: [{ turnNumber: 1 }, { turnNumber: 2 }],
      } as never);

      const result = await processPlaygroundChat(baseConfig, baseMessages, {
        ...baseOptions,
        mode: 'multi-turn',
        sessionId: 'existing-session',
      });

      expect(result.sessionId).toBe('existing-session');
      expect(result.turnNumber).toBe(3); // 2 existing + 1
    });

    it('throws SESSION_NOT_FOUND when session does not exist', async () => {
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(null);

      await expect(
        processPlaygroundChat(baseConfig, baseMessages, {
          ...baseOptions,
          mode: 'multi-turn',
          sessionId: 'nonexistent',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('throws SESSION_COMPLETE when max turns reached', async () => {
      mockedPrisma.screeningSession.findUnique.mockResolvedValue({
        id: 'full-session',
        source: 'playground',
        status: 'IN_PROGRESS',
        locale: 'id',
        mode: 'ai',
        turnLogs: Array.from({ length: 7 }, (_, i) => ({ turnNumber: i + 1 })),
      } as never);

      await expect(
        processPlaygroundChat(baseConfig, baseMessages, {
          ...baseOptions,
          mode: 'multi-turn',
          sessionId: 'full-session',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'SESSION_COMPLETE',
      });
    });
  });

  describe('TurnLog persistence failure', () => {
    beforeEach(setupHappyPath);

    it('returns response even when TurnLog persistence fails', async () => {
      mockedPrisma.turnLog.create.mockRejectedValue(new Error('DB error'));

      const result = await processPlaygroundChat(baseConfig, baseMessages, baseOptions);

      expect(result.reply).toBe('Halo');
      expect(result.sessionId).toBe('session-123');
    });
  });
});

// ─── Task 2.2: TurnLog Persistence with Metadata ─────────────────────────────

describe('persistTurnLog (exported)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const persistConfig: PlaygroundConfig = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    temperature: 1.2,
    topP: 0.8,
    maxTokens: 512,
    systemPrompt: 'Custom system prompt for testing.',
  };

  it('stores metadata with all 7 required fields', async () => {
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    persistTurnLog({
      sessionId: 'persist-test-session',
      turnNumber: 3,
      userMessage: 'Test message',
      rawResponse: '{"reply":"OK"}',
      parseStatus: 'SUCCESS',
      systemMessage: 'Custom system prompt for testing.',
      model: 'gemini-2.5-flash',
      latencyMs: 250,
      tokensUsed: { input: 5, output: 10 },
      config: persistConfig,
      mode: 'compare',
      customSystemPrompt: true,
    });

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
    });

    const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const metadata = (callArgs?.data as Record<string, unknown>)?.metadata as Record<
      string,
      unknown
    >;

    expect(metadata).toEqual({
      source: 'playground',
      provider: 'gemini',
      temperature: 1.2,
      topP: 0.8,
      maxTokens: 512,
      customSystemPrompt: true,
      mode: 'compare',
    });
  });

  it('passes customSystemPrompt=false when explicitly set', async () => {
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    persistTurnLog({
      sessionId: 'session-abc',
      turnNumber: 1,
      userMessage: 'Hi',
      rawResponse: '{"reply":"Hey"}',
      parseStatus: 'SUCCESS',
      systemMessage: 'Default prompt.',
      model: 'llama-3.1-8b-instant',
      latencyMs: 100,
      tokensUsed: null,
      config: { ...persistConfig, provider: 'groq' as const },
      mode: 'single-shot',
      customSystemPrompt: false,
    });

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
    });

    const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const metadata = (callArgs?.data as Record<string, unknown>)?.metadata as Record<
      string,
      unknown
    >;
    expect(metadata.customSystemPrompt).toBe(false);
  });

  it('does not throw on DB failure — non-blocking', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedPrisma.turnLog.create.mockRejectedValue(new Error('Connection refused'));

    // Should not throw
    persistTurnLog({
      sessionId: 'session-fail',
      turnNumber: 1,
      userMessage: 'test',
      rawResponse: '',
      parseStatus: 'FAILURE',
      systemMessage: 'prompt',
      model: 'test-model',
      latencyMs: 0,
      tokensUsed: null,
      config: persistConfig,
      mode: 'single-shot',
      customSystemPrompt: true,
    });

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Playground] TurnLog persistence failed',
        expect.objectContaining({ sessionId: 'session-fail' }),
      );
    });

    consoleSpy.mockRestore();
  });
});

describe('processPlaygroundChat — customSystemPrompt propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  it('passes customSystemPrompt=false to TurnLog metadata', async () => {
    await processPlaygroundChat(baseConfig, baseMessages, {
      ...baseOptions,
      customSystemPrompt: false,
    });

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
    });

    const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const metadata = (callArgs?.data as Record<string, unknown>)?.metadata as Record<
      string,
      unknown
    >;
    expect(metadata.customSystemPrompt).toBe(false);
  });

  it('defaults customSystemPrompt to true when not provided', async () => {
    await processPlaygroundChat(baseConfig, baseMessages, baseOptions);

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
    });

    const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const metadata = (callArgs?.data as Record<string, unknown>)?.metadata as Record<
      string,
      unknown
    >;
    expect(metadata.customSystemPrompt).toBe(true);
  });
});
