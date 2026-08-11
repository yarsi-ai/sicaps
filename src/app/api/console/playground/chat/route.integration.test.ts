/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Integration test with deep Prisma mocks; type casting is intentionally loose
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    turnLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
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
    PLAYGROUND_GEMINI_KEY: 'AIza_test',
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
import { POST } from './route';
import { GET } from '@/app/api/test/evaluations/export/route';

const mockedCreateLLMClient = vi.mocked(createLLMClient);
const mockedParseLLMResponse = vi.mocked(parseLLMResponse);
const mockedResolveProviderConfig = vi.mocked(resolveProviderConfig);
const mockedGetProviderEnvVar = vi.mocked(getProviderEnvVar);
const mockedAppendToPool = vi.mocked(appendToPool);
const mockedCalculateAllScores = vi.mocked(calculateAllScores);
const mockedPrisma = vi.mocked(prisma, { deep: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createPostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/console/playground/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createExportRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/test/evaluations/export');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
}

const VALID_SINGLE_SHOT_BODY = {
  provider: 'groq',
  model: 'llama-3.1-8b-instant',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  systemPrompt: 'You are a screening assistant.',
  messages: [{ role: 'user', content: 'Saya merasa gatal di tangan' }],
  enableScoring: false,
  locale: 'id',
  mode: 'single-shot' as const,
};

const VALID_EXTRACTION = {
  intensitas: [{ keyword: 'gatal', confidence: 'high' }],
  waktu: [],
  lokasi_tubuh: [{ keyword: 'tangan', confidence: 'medium' }],
  kontak: [],
  lesi: [],
  faktor_risiko: [],
};

const MOCK_SCORING_RESULT = {
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
      raw: 1,
      capped: 1,
      status: 'assessed',
      matchedPatterns: ['tangan'],
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
  totalScore: 2,
  riskLevel: 'LOW',
};

function setupLLMMocks(reply = 'Halo, ada yang bisa saya bantu?', extraction = VALID_EXTRACTION) {
  mockedResolveProviderConfig.mockReturnValue({
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: 'gsk_test_key',
  });
  mockedGetProviderEnvVar.mockReturnValue('PLAYGROUND_GROQ_KEY');

  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ reply, extraction }) } }],
    usage: { prompt_tokens: 50, completion_tokens: 30 },
  });
  mockedCreateLLMClient.mockReturnValue({
    chat: { completions: { create: mockCreate } },
  } as unknown as ReturnType<typeof createLLMClient>);

  mockedParseLLMResponse.mockReturnValue({
    status: 'success',
    data: {
      reply,
      extraction,
      categories_covered: ['intensitas'],
      next_category: 'waktu',
      should_follow_up: true,
    },
  });

  mockedAppendToPool.mockReturnValue({
    intensitas: [
      { keyword: 'gatal', confidence: 'high', turn: 1, matched: false, matchedPattern: null },
    ],
    waktu: [],
    lokasi_tubuh: [
      { keyword: 'tangan', confidence: 'medium', turn: 1, matched: false, matchedPattern: null },
    ],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  });
  mockedCalculateAllScores.mockReturnValue(MOCK_SCORING_RESULT);
}

function setupSessionCreate(sessionId = 'session-integration-1') {
  mockedPrisma.screeningSession.create.mockResolvedValue({
    id: sessionId,
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
  });
  mockedPrisma.turnLog.create.mockResolvedValue({} as never);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Integration: Single-shot flow', () => {
  beforeEach(() => {
    setupLLMMocks();
    setupSessionCreate();
  });

  it('returns correct response shape with success envelope', async () => {
    const response = await POST(createPostRequest(VALID_SINGLE_SHOT_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      reply: expect.any(String),
      extraction: expect.any(Object),
      scoring: null,
      metadata: {
        latencyMs: expect.any(Number),
        model: 'llama-3.1-8b-instant',
        tokensUsed: { input: 50, output: 30 },
        provider: 'groq',
      },
      sessionId: 'session-integration-1',
      turnNumber: 1,
    });
  });

  it('creates TurnLog with playground metadata', async () => {
    await POST(createPostRequest(VALID_SINGLE_SHOT_BODY));

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalled();
    });

    const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const data = callArgs?.data as Record<string, unknown>;
    const metadata = data.metadata as Record<string, unknown>;

    expect(data.sessionId).toBe('session-integration-1');
    expect(data.turnNumber).toBe(1);
    expect(data.userMessage).toBe('Saya merasa gatal di tangan');
    expect(data.parseStatus).toBe('SUCCESS');
    expect(data.promptVersion).toBe('playground');
    expect(data.retryCount).toBe(0);

    expect(metadata).toEqual({
      source: 'playground',
      provider: 'groq',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 1024,
      customSystemPrompt: true,
      mode: 'single-shot',
    });
  });

  it('creates ScreeningSession with source=playground', async () => {
    await POST(createPostRequest(VALID_SINGLE_SHOT_BODY));

    expect(mockedPrisma.screeningSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'playground',
        locale: 'id',
        mode: 'ai',
        status: 'IN_PROGRESS',
        promptVersion: 'playground',
      }),
    });
  });
});

describe('Integration: Multi-turn flow (3 messages)', () => {
  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    setupLLMMocks();

    // First call: create session
    mockedPrisma.screeningSession.create.mockResolvedValue({
      id: SESSION_ID,
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
    });
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);
  });

  it('creates session on first message and reuses on subsequent', async () => {
    // Turn 1: no sessionId → creates new session
    const turn1Body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      messages: [{ role: 'user', content: 'Saya gatal' }],
    };
    const turn1Response = await POST(createPostRequest(turn1Body));
    const turn1Json = await turn1Response.json();

    expect(turn1Response.status).toBe(200);
    expect(turn1Json.data.sessionId).toBe(SESSION_ID);
    expect(turn1Json.data.turnNumber).toBe(1);
    expect(mockedPrisma.screeningSession.create).toHaveBeenCalledTimes(1);

    // Turn 2: with sessionId → reuses existing
    mockedPrisma.screeningSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      source: 'playground',
      status: 'IN_PROGRESS',
      locale: 'id',
      mode: 'ai',
      turnLogs: [{ turnNumber: 1 }],
    } as never);

    const turn2Body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      sessionId: SESSION_ID,
      messages: [
        { role: 'user', content: 'Saya gatal' },
        { role: 'assistant', content: 'Halo, ada yang bisa saya bantu?' },
        { role: 'user', content: 'Sudah seminggu' },
      ],
    };
    const turn2Response = await POST(createPostRequest(turn2Body));
    const turn2Json = await turn2Response.json();

    expect(turn2Response.status).toBe(200);
    expect(turn2Json.data.sessionId).toBe(SESSION_ID);
    expect(turn2Json.data.turnNumber).toBe(2);

    // Turn 3: with sessionId → reuses again
    mockedPrisma.screeningSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      source: 'playground',
      status: 'IN_PROGRESS',
      locale: 'id',
      mode: 'ai',
      turnLogs: [{ turnNumber: 1 }, { turnNumber: 2 }],
    } as never);

    const turn3Body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      sessionId: SESSION_ID,
      enableScoring: true,
      messages: [
        { role: 'user', content: 'Saya gatal' },
        { role: 'assistant', content: 'Halo, ada yang bisa saya bantu?' },
        { role: 'user', content: 'Sudah seminggu' },
        { role: 'assistant', content: 'OK, saya mengerti' },
        { role: 'user', content: 'Di tangan dan kaki' },
      ],
    };
    const turn3Response = await POST(createPostRequest(turn3Body));
    const turn3Json = await turn3Response.json();

    expect(turn3Response.status).toBe(200);
    expect(turn3Json.data.sessionId).toBe(SESSION_ID);
    expect(turn3Json.data.turnNumber).toBe(3);
  });

  it('grows message history with each turn', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ reply: 'Halo', extraction: VALID_EXTRACTION }) } },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 30 },
    });
    mockedCreateLLMClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as ReturnType<typeof createLLMClient>);

    // Turn 1: 1 user message
    const turn1Body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      messages: [{ role: 'user', content: 'Saya gatal' }],
    };
    await POST(createPostRequest(turn1Body));

    // Verify turn 1 messages sent to LLM (system + 1 user)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a screening assistant.' },
          { role: 'user', content: 'Saya gatal' },
        ],
      }),
      expect.any(Object),
    );

    // Turn 2: 2 user + 1 assistant (accumulated history)
    mockedPrisma.screeningSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      source: 'playground',
      status: 'IN_PROGRESS',
      locale: 'id',
      mode: 'ai',
      turnLogs: [{ turnNumber: 1 }],
    } as never);

    const turn2Messages = [
      { role: 'user' as const, content: 'Saya gatal' },
      { role: 'assistant' as const, content: 'Halo, ada yang bisa saya bantu?' },
      { role: 'user' as const, content: 'Sudah seminggu' },
    ];
    const turn2Body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      sessionId: SESSION_ID,
      messages: turn2Messages,
    };
    await POST(createPostRequest(turn2Body));

    // Verify turn 2 messages sent to LLM (system + full history)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'system', content: 'You are a screening assistant.' }, ...turn2Messages],
      }),
      expect.any(Object),
    );
  });

  it('includes scoring when enabled on multi-turn', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      source: 'playground',
      status: 'IN_PROGRESS',
      locale: 'id',
      mode: 'ai',
      turnLogs: [{ turnNumber: 1 }],
    } as never);

    const body = {
      ...VALID_SINGLE_SHOT_BODY,
      mode: 'multi-turn',
      sessionId: SESSION_ID,
      enableScoring: true,
      messages: [
        { role: 'user', content: 'Saya gatal' },
        { role: 'assistant', content: 'OK' },
        { role: 'user', content: 'Di tangan' },
      ],
    };
    const response = await POST(createPostRequest(body));
    const json = await response.json();

    expect(json.data.scoring).toEqual(MOCK_SCORING_RESULT);
  });
});

describe('Integration: Compare flow', () => {
  beforeEach(() => {
    setupLLMMocks();
  });

  it('creates 2 separate TurnLogs when called twice in compare mode', async () => {
    let sessionCounter = 0;
    mockedPrisma.screeningSession.create.mockImplementation(() => {
      sessionCounter += 1;
      return Promise.resolve({
        id: `compare-session-${sessionCounter}`,
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
      });
    });
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const userMessage = 'Saya merasa gatal di seluruh badan';

    // Config A: Groq with lower temperature
    const configA = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 1024,
      systemPrompt: 'You are a screening assistant.',
      messages: [{ role: 'user', content: userMessage }],
      enableScoring: false,
      locale: 'id',
      mode: 'compare' as const,
    };

    // Config B: Groq with higher temperature (simulates different config)
    const configB = {
      ...configA,
      temperature: 1.5,
      model: 'llama-3.1-70b-versatile',
    };

    // Send both requests (simulates client calling API twice in compare mode)
    const [responseA, responseB] = await Promise.all([
      POST(createPostRequest(configA)),
      POST(createPostRequest(configB)),
    ]);

    const jsonA = await responseA.json();
    const jsonB = await responseB.json();

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(jsonA.data).toBeDefined();
    expect(jsonB.data).toBeDefined();

    // Both have the same user message
    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalledTimes(2);
    });

    // Verify both TurnLogs have same userMessage but different config metadata
    const call1Args = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
    const call2Args = mockedPrisma.turnLog.create.mock.calls[1]?.[0];
    const data1 = call1Args?.data as Record<string, unknown>;
    const data2 = call2Args?.data as Record<string, unknown>;

    expect(data1.userMessage).toBe(userMessage);
    expect(data2.userMessage).toBe(userMessage);

    const metadata1 = data1.metadata as Record<string, unknown>;
    const metadata2 = data2.metadata as Record<string, unknown>;

    expect(metadata1.mode).toBe('compare');
    expect(metadata2.mode).toBe('compare');
    expect(metadata1.source).toBe('playground');
    expect(metadata2.source).toBe('playground');
  });

  it('both calls can have different provider/model in metadata', async () => {
    // Setup Groq for config A
    mockedResolveProviderConfig.mockImplementation((provider) => {
      if (provider === 'groq') {
        return { baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test' };
      }
      if (provider === 'gemini') {
        return {
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          apiKey: 'AIza_test',
        };
      }
      return null;
    });

    let sessionCounter = 0;
    mockedPrisma.screeningSession.create.mockImplementation(() => {
      sessionCounter += 1;
      return Promise.resolve({
        id: `compare-provider-${sessionCounter}`,
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
      });
    });
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const userMessage = 'Gatal di tangan';

    const configA = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 1024,
      systemPrompt: 'You are a screening assistant.',
      messages: [{ role: 'user', content: userMessage }],
      enableScoring: false,
      locale: 'id',
      mode: 'compare' as const,
    };

    const configB = {
      ...configA,
      provider: 'gemini' as const,
      model: 'gemini-2.5-flash',
    };

    await Promise.all([POST(createPostRequest(configA)), POST(createPostRequest(configB))]);

    await vi.waitFor(() => {
      expect(mockedPrisma.turnLog.create).toHaveBeenCalledTimes(2);
    });

    const metadata1 = (
      mockedPrisma.turnLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>
    ).metadata as Record<string, unknown>;
    const metadata2 = (
      mockedPrisma.turnLog.create.mock.calls[1]?.[0]?.data as Record<string, unknown>
    ).metadata as Record<string, unknown>;

    // Different providers in metadata
    const providers = [metadata1.provider, metadata2.provider].sort();
    expect(providers).toEqual(['gemini', 'groq']);
  });
});

describe('Integration: Export isolation', () => {
  it('export endpoint filters by source=testing (only testing data)', async () => {
    mockedPrisma.turnLog.findMany.mockResolvedValue([]);

    await GET(createExportRequest());

    // Default export endpoint only includes testing data
    expect(mockedPrisma.turnLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { source: 'testing' },
        }),
      }),
    );
  });

  it('playground TurnLogs with source=playground are excluded from testing export', async () => {
    // Simulate: DB has both playground and testing TurnLogs
    // The export endpoint only queries source='testing', so playground data is never returned
    const testingTurnLog = {
      id: 'log-testing-1',
      sessionId: 'session-testing',
      turnNumber: 1,
      userMessage: 'testing message',
      rawResponse: '{"reply":"Testing reply"}',
      parseStatus: 'SUCCESS',
      parseError: null,
      systemMessage: 'system prompt',
      model: 'llama-3.1-8b-instant',
      promptVersion: 'v1',
      latencyMs: 500,
      tokenUsage: { input: 20, output: 10 },
      retryCount: 0,
      metadata: null,
      createdAt: new Date('2025-01-15T10:00:00Z'),
      session: {
        source: 'testing',
        totalScore: 5,
        riskLevel: 'LOW',
        extractions: [],
        evaluationFeedbacks: [],
      },
    };

    mockedPrisma.turnLog.findMany.mockResolvedValue([testingTurnLog] as never);

    const response = await GET(createExportRequest());
    const csv = await response.text();
    const lines = csv.split('\n');

    // Only testing data appears — no playground data
    expect(lines).toHaveLength(2); // header + 1 testing row
    expect(csv).toContain('testing message');
    expect(csv).not.toContain('playground');
  });

  it('playground data does not leak into export when mixed sources exist in DB', async () => {
    // The key insight: export endpoint hardcodes `session: { source: 'testing' }`
    // So even if playground TurnLogs exist in DB, they are filtered at query level
    mockedPrisma.turnLog.findMany.mockResolvedValue([]);

    const response = await GET(createExportRequest());
    const csv = await response.text();
    const lines = csv.split('\n');

    // Only header, no data rows
    expect(lines).toHaveLength(1);

    // Verify the query specifically filters for testing
    const queryArg = mockedPrisma.turnLog.findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    const where = queryArg.where as Record<string, unknown>;
    const sessionFilter = where.session as Record<string, unknown>;
    expect(sessionFilter.source).toBe('testing');
    expect(sessionFilter.source).not.toBe('playground');
    expect(sessionFilter.source).not.toBe('production');
  });
});
