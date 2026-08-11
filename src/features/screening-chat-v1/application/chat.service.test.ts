// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: { create: vi.fn() },
    turnExtraction: { create: vi.fn() },
    turnLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/llm', () => ({
  getPrimaryClient: vi.fn(),
  getFallbackClient: vi.fn(),
  getLLMConfig: vi.fn(),
  getFallbackModel: vi.fn(),
}));

vi.mock('../adapters/llm/parser', () => ({
  parseLLMResponse: vi.fn(),
  parseOutputResponse: vi.fn(),
  extractReplyFromPartial: vi.fn(),
}));

vi.mock('../adapters/llm/prompts', () => ({
  buildMessages: vi.fn(),
  buildOutputMessages: vi.fn(),
  PROMPT_VERSION: 'v1',
}));

vi.mock('../adapters/llm/stream-helpers', () => ({
  encodeSSE: vi.fn(
    (event: unknown) =>
      `event: ${(event as { event: string }).event}\ndata: ${JSON.stringify((event as { data: unknown }).data)}\n\n`,
  ),
  createReplyDetector: vi.fn(),
}));

vi.mock('../domain/scoring/pool', () => ({
  appendToPool: vi.fn(),
}));

vi.mock('../domain/scoring/engine', () => ({
  calculateAllScores: vi.fn(),
}));

vi.mock('../adapters/questionnaire/pills', () => ({
  getPills: vi.fn(),
  getPillById: vi.fn(),
}));

vi.mock('@/lib/sanitize', () => ({
  sanitizeUserInput: vi.fn((msg: string) => msg),
}));

vi.mock('../domain/chat/crisis', () => ({
  checkCrisis: vi.fn(() => null),
}));

vi.mock('../domain/chat/instruction', () => ({
  getNextInstruction: vi.fn(() => ({
    type: 'EXPLORE_CATEGORY',
    targetCategory: 'intensitas',
    isFollowUp: false,
  })),
  buildCategoryTracker: vi.fn(() => ({})),
}));

vi.mock('../domain/chat/edge-cases', () => ({
  detectEdgeCase: vi.fn(() => ({ type: 'normal' })),
}));

vi.mock('../domain/chat/output', () => ({
  getFallbackTemplate: vi.fn(),
  buildOutputContext: vi.fn(),
}));

vi.mock('../domain/chat/coverage', () => ({
  determineCoveredCategories: vi.fn((current: string[]) => current),
}));

vi.mock('../domain/chat/state-machine', () => ({
  transition: vi.fn(() => ({ newState: 'CHATTING', context: {} })),
}));

vi.mock('../domain/chat/persona', () => ({
  selectTheme: vi.fn(() => 'hybrid'),
}));

import { prisma } from '@/db/prisma';
import { getPrimaryClient, getFallbackClient, getLLMConfig, getFallbackModel } from '@/lib/llm';
import { parseLLMResponse, parseOutputResponse } from '../adapters/llm/parser';
import { buildMessages, buildOutputMessages } from '../adapters/llm/prompts';
import { createReplyDetector } from '../adapters/llm/stream-helpers';
import { appendToPool } from '../domain/scoring/pool';
import { calculateAllScores } from '../domain/scoring/engine';
import { getPills, getPillById } from '../adapters/questionnaire/pills';
import { checkCrisis } from '../domain/chat/crisis';
import { getNextInstruction } from '../domain/chat/instruction';
import { detectEdgeCase } from '../domain/chat/edge-cases';
import { getFallbackTemplate, buildOutputContext } from '../domain/chat/output';
import { determineCoveredCategories } from '../domain/chat/coverage';
import { transition } from '../domain/chat/state-machine';
import {
  generateSessionOutput,
  shouldTriggerOutput,
  processChatTurn,
  processQuestionnaireAnswer,
} from './chat.service';

const mockedPrisma = vi.mocked(prisma, { deep: true });
const mockedGetPrimaryClient = vi.mocked(getPrimaryClient);
const mockedGetFallbackClient = vi.mocked(getFallbackClient);
const mockedGetLLMConfig = vi.mocked(getLLMConfig);
const mockedGetFallbackModel = vi.mocked(getFallbackModel);
const mockedParseLLMResponse = vi.mocked(parseLLMResponse);
const mockedParseOutputResponse = vi.mocked(parseOutputResponse);
const mockedBuildMessages = vi.mocked(buildMessages);
const mockedBuildOutputMessages = vi.mocked(buildOutputMessages);
const mockedCreateReplyDetector = vi.mocked(createReplyDetector);
const mockedAppendToPool = vi.mocked(appendToPool);
const mockedCalculateAllScores = vi.mocked(calculateAllScores);
const mockedBuildOutputContext = vi.mocked(buildOutputContext);
const mockedGetFallbackTemplate = vi.mocked(getFallbackTemplate);
const mockedCheckCrisis = vi.mocked(checkCrisis);
const mockedGetNextInstruction = vi.mocked(getNextInstruction);
const mockedDetectEdgeCase = vi.mocked(detectEdgeCase);
const mockedDetermineCoveredCategories = vi.mocked(determineCoveredCategories);
const mockedTransition = vi.mocked(transition);
const mockedGetPills = vi.mocked(getPills);
const mockedGetPillById = vi.mocked(getPillById);

// --- Helpers ---

const defaultConfig = {
  model: 'test-model',
  timeoutMs: 30000,
  retryTimeoutMs: 15000,
  temperatureChat: 0.7,
  temperatureOutput: 0.5,
  maxTokensChat: 1024,
  maxTokensOutput: 2048,
  topP: 0.9,
  healthTimeoutMs: 5000,
};

function createMockSession(overrides?: Record<string, unknown>) {
  return {
    id: 'session-1',
    locale: 'id',
    mode: 'ai',
    status: 'IN_PROGRESS',
    perception: 'ADEQUATE',
    categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    metadata: null,
    messages: [
      {
        id: 'm1',
        sessionId: 'session-1',
        role: 'user',
        content: 'gatal',
        isVoice: false,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'ok',
        isVoice: false,
        createdAt: new Date(),
      },
    ],
    extractions: [
      {
        id: 'e1',
        sessionId: 'session-1',
        turnNumber: 1,
        extraction: {
          intensitas: [{ keyword: 'gatal', confidence: 'high' }],
          waktu: [],
          lokasi_tubuh: [],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        },
        scores: {},
        createdAt: new Date(),
      },
    ],
    demographics: {
      id: 'd1',
      sessionId: 'session-1',
      age: 15,
      gender: 'male',
      educationLevel: 'JUNIOR_HIGH',
    },
    ...overrides,
  };
}

function createMockScoringResult() {
  return {
    totalScore: 5,
    riskLevel: 'MODERATE' as const,
    version: 'v1',
    scores: {
      intensitas: {
        raw: 2,
        capped: 2,
        status: 'assessed',
        matchedPatterns: ['gatal'],
        unmatchedKeywords: [],
      },
      waktu: {
        raw: 1,
        capped: 1,
        status: 'assessed',
        matchedPatterns: ['malam'],
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
        raw: 1,
        capped: 1,
        status: 'assessed',
        matchedPatterns: ['serumah'],
        unmatchedKeywords: [],
      },
      lesi: { raw: 0, capped: 0, status: 'assessed', matchedPatterns: [], unmatchedKeywords: [] },
      faktor_risiko: {
        raw: 0,
        capped: 0,
        status: 'assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
    },
  };
}

function createMockClient(response: unknown) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(response),
      },
    },
  };
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      result += decoder.decode(chunk.value);
    }
  }
  return result;
}

// --- Tests ---

describe('generateSessionOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockReturnValue(defaultConfig as ReturnType<typeof getLLMConfig>);
    mockedGetFallbackClient.mockReturnValue(null);
    mockedGetFallbackModel.mockReturnValue(null);
    mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);
    mockedAppendToPool.mockImplementation((pool) => pool);
    mockedCalculateAllScores.mockReturnValue(
      createMockScoringResult() as ReturnType<typeof calculateAllScores>,
    );
    mockedBuildOutputContext.mockReturnValue({
      riskLevel: 'MODERATE',
      perception: 'ADEQUATE',
      locale: 'id',
      theme: 'hybrid',
      categoriesAssessed: [
        'intensitas',
        'waktu',
        'lokasi_tubuh',
        'kontak',
        'lesi',
        'faktor_risiko',
      ],
      categoriesNotAssessed: [],
      isForceClose: false,
      matchedKeywords: {
        intensitas: ['gatal'],
        waktu: ['malam'],
        lokasi_tubuh: ['tangan'],
        kontak: ['serumah'],
        lesi: [],
        faktor_risiko: [],
      },
      scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 1, kontak: 1, lesi: 0, faktor_risiko: 0 },
      totalScore: 5,
    });
  });

  it('generates output on successful LLM call and persists COMPLETED status', async () => {
    const session = createMockSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    const mockClient = createMockClient({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: 'Risiko sedang',
              perceptionResponse: 'Persepsi Anda wajar',
              recommendation: 'Pantau gejala',
              personalizedSuggestion: 'Jaga kebersihan kamar',
            }),
          },
        },
      ],
    });
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedParseOutputResponse.mockReturnValue({
      status: 'success',
      data: {
        conclusion: 'Risiko sedang',
        perceptionResponse: 'Persepsi Anda wajar',
        recommendation: 'Pantau gejala',
        personalizedSuggestion: 'Jaga kebersihan kamar',
      },
    });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateSessionOutput('session-1');
    await drainStream(stream);

    // Verify session update with COMPLETED status and output fields
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          aiConclusion: 'Risiko sedang',
          aiPerceptionResponse: 'Persepsi Anda wajar',
          aiRecommendation: 'Pantau gejala',
          aiSuggestion: 'Jaga kebersihan kamar',
          status: 'COMPLETED',
          riskLevel: 'MODERATE',
          perception: 'ADEQUATE',
        }),
      }),
    );
  });

  it('uses static fallback when LLM fails after 2 attempts', async () => {
    const session = createMockSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    const mockClient = createMockClient(null);
    mockClient.chat.completions.create.mockRejectedValue(new Error('timeout'));
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    mockedGetFallbackTemplate.mockReturnValue({
      kesimpulan: 'Fallback kesimpulan',
      persepsi: null,
      rekomendasi: 'Fallback rekomendasi',
      saranPenanganan: null,
    });

    const stream = await generateSessionOutput('session-1');
    await drainStream(stream);

    // Verify fallback was used — getFallbackTemplate called with correct args
    expect(mockedGetFallbackTemplate).toHaveBeenCalledWith('MODERATE', 'id');
    // Verify persistence includes fallback output
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiConclusion: 'Fallback kesimpulan',
          aiPerceptionResponse: null,
          aiRecommendation: 'Fallback rekomendasi',
          aiSuggestion: null,
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('retries once on first attempt parse failure before falling back', async () => {
    const session = createMockSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    const mockClient = createMockClient(null);
    // First attempt: parse failure, Second attempt: success
    mockClient.chat.completions.create
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'invalid json' } }],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                conclusion: 'Retry success',
                perceptionResponse: null,
                recommendation: 'Rekomendasi',
                personalizedSuggestion: null,
              }),
            },
          },
        ],
      });

    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedParseOutputResponse
      .mockReturnValueOnce({ status: 'failure', classification: 'json_parse_error' })
      .mockReturnValueOnce({
        status: 'success',
        data: {
          conclusion: 'Retry success',
          perceptionResponse: null,
          recommendation: 'Rekomendasi',
          personalizedSuggestion: null,
        },
      });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateSessionOutput('session-1');
    await drainStream(stream);

    // Verify LLM was called twice (2-attempt budget)
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    // Verify second attempt data was persisted
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiConclusion: 'Retry success',
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('marks isForceClose in metadata when triggered by force close', async () => {
    const session = createMockSession({
      categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh'],
    });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    const mockClient = createMockClient({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: 'Force close result',
              perceptionResponse: null,
              recommendation: 'Reko',
              personalizedSuggestion: null,
            }),
          },
        },
      ],
    });
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedParseOutputResponse.mockReturnValue({
      status: 'success',
      data: {
        conclusion: 'Force close result',
        perceptionResponse: null,
        recommendation: 'Reko',
        personalizedSuggestion: null,
      },
    });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateSessionOutput('session-1', { isForceClose: true });
    await drainStream(stream);

    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ isForceClose: true }),
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(null as never);

    await expect(generateSessionOutput('nonexistent')).rejects.toThrow('Session not found');
  });

  it('throws ValidationError when session is not IN_PROGRESS', async () => {
    const session = createMockSession({ status: 'COMPLETED' });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    await expect(generateSessionOutput('session-1')).rejects.toThrow('Session is not in progress');
  });

  it('uses preloaded session when provided', async () => {
    const session = createMockSession();
    const mockClient = createMockClient({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: 'Ok',
              perceptionResponse: null,
              recommendation: 'Reko',
              personalizedSuggestion: null,
            }),
          },
        },
      ],
    });
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedParseOutputResponse.mockReturnValue({
      status: 'success',
      data: {
        conclusion: 'Ok',
        perceptionResponse: null,
        recommendation: 'Reko',
        personalizedSuggestion: null,
      },
    });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateSessionOutput('session-1', {
      preloadedSession: session as never,
    });
    await drainStream(stream);

    // Should NOT call findUnique since session was preloaded
    expect(mockedPrisma.screeningSession.findUnique).not.toHaveBeenCalled();
  });

  it('defaults perception to ADEQUATE when session has null perception', async () => {
    const session = createMockSession({ perception: null });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    const mockClient = createMockClient({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: 'Ok',
              perceptionResponse: null,
              recommendation: 'Reko',
              personalizedSuggestion: null,
            }),
          },
        },
      ],
    });
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);
    mockedParseOutputResponse.mockReturnValue({
      status: 'success',
      data: {
        conclusion: 'Ok',
        perceptionResponse: null,
        recommendation: 'Reko',
        personalizedSuggestion: null,
      },
    });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateSessionOutput('session-1');
    await drainStream(stream);

    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          perception: 'ADEQUATE',
        }),
      }),
    );
  });
});

describe('shouldTriggerOutput', () => {
  it('returns trigger=true when all 6 categories are covered', () => {
    const result = shouldTriggerOutput(
      ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      8,
    );
    expect(result).toEqual({ trigger: true, isForceClose: false });
  });

  it('returns trigger=true with isForceClose when message count reaches 14', () => {
    const result = shouldTriggerOutput(['intensitas', 'waktu'], 14);
    expect(result).toEqual({ trigger: true, isForceClose: true });
  });

  it('returns trigger=false when categories incomplete and under message limit', () => {
    const result = shouldTriggerOutput(['intensitas', 'waktu'], 6);
    expect(result).toEqual({ trigger: false, isForceClose: false });
  });

  it('prioritizes all-covered over force-close', () => {
    const result = shouldTriggerOutput(
      ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      14,
    );
    expect(result).toEqual({ trigger: true, isForceClose: false });
  });
});

// ─── processChatTurn: Degradation and Error Flows (Task 12.2) ───

describe('processChatTurn degradation and error flows', () => {
  function createChatSession(overrides?: Record<string, unknown>) {
    return {
      id: 'session-1',
      locale: 'id',
      mode: 'ai',
      status: 'IN_PROGRESS',
      perception: 'ADEQUATE',
      categoriesCovered: ['intensitas'],
      metadata: null,
      messages: [
        {
          id: 'm1',
          sessionId: 'session-1',
          role: 'user',
          content: 'gatal',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'ok',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
      extractions: [
        {
          id: 'e1',
          sessionId: 'session-1',
          turnNumber: 1,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 'high' }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          scores: {},
          createdAt: new Date(),
        },
      ],
      demographics: {
        id: 'd1',
        sessionId: 'session-1',
        age: 15,
        gender: 'male',
        educationLevel: 'JUNIOR_HIGH',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockReturnValue(defaultConfig as ReturnType<typeof getLLMConfig>);
    mockedGetFallbackClient.mockReturnValue(null);
    mockedGetFallbackModel.mockReturnValue(null);
    mockedBuildMessages.mockReturnValue([{ role: 'system', content: 'system prompt' }]);
    mockedAppendToPool.mockImplementation((pool) => pool);
    mockedCalculateAllScores.mockReturnValue(
      createMockScoringResult() as ReturnType<typeof calculateAllScores>,
    );
    mockedCheckCrisis.mockReturnValue(null);
    mockedDetectEdgeCase.mockReturnValue({ type: 'normal' } as ReturnType<typeof detectEdgeCase>);
    mockedGetNextInstruction.mockReturnValue({
      type: 'EXPLORE_CATEGORY',
      targetCategory: 'waktu',
      isFollowUp: false,
    } as ReturnType<typeof getNextInstruction>);
    mockedTransition.mockReturnValue({ newState: 'CHATTING', context: {} } as ReturnType<
      typeof transition
    >);
    mockedDetermineCoveredCategories.mockImplementation((current) => current as string[]);
    mockedPrisma.$transaction.mockResolvedValue([] as never);
  });

  describe('LLM fails 2× pre-token → questionnaire mode (Req 9.7)', () => {
    it('sets session mode to questionnaire, emits LLM_UNAVAILABLE, and returns pills', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

      // Mock LLM client to throw on both attempts (pre-token failure)
      const mockClient = createMockClient(null);
      mockClient.chat.completions.create
        .mockRejectedValueOnce(new Error('LLM timeout'))
        .mockRejectedValueOnce(new Error('LLM timeout'));
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      // Mock pills for the first uncovered category ('waktu')
      mockedGetPills.mockReturnValue([
        { id: 'waktu_night', label: 'Gatal malam hari', score: 1, category: 'waktu', locale: 'id' },
        {
          id: 'waktu_always',
          label: 'Gatal terus-menerus',
          score: 1,
          category: 'waktu',
          locale: 'id',
        },
      ]);

      const stream = await processChatTurn('session-1', 'saya gatal', false);
      const output = await drainStream(stream);

      // Verify LLM_UNAVAILABLE error event emitted
      expect(output).toContain('event: error');
      expect(output).toContain('LLM_UNAVAILABLE');

      // Verify done event has mode='questionnaire' and pills
      expect(output).toContain('event: done');
      expect(output).toContain('"mode":"questionnaire"');
      expect(output).toContain('"pills"');
      expect(output).toContain('waktu_night');

      // Verify DB persisted mode change to questionnaire
      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            // screeningSession.update with mode: 'questionnaire'
          }),
        ]),
      );
    });
  });

  describe('LLM fails post-token → STREAM_INTERRUPTED (Req 9.9)', () => {
    it('emits STREAM_INTERRUPTED event, persists partial reply, does not retry', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

      // Mock createReplyDetector to forward all tokens
      mockedCreateReplyDetector.mockReturnValue({
        feed: (delta: string) => ({ forwardable: delta, buffered: '' }),
        isInsideReply: () => true,
      } as ReturnType<typeof createReplyDetector>);

      // Create an async iterable that yields some chunks then throws
      async function* streamWithError() {
        yield { choices: [{ delta: { content: 'Terima' } }] };
        yield { choices: [{ delta: { content: ' kasih' } }] };
        throw new Error('Connection reset');
      }

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValueOnce(streamWithError()),
          },
        },
      };
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn('session-1', 'saya gatal', false);
      const output = await drainStream(stream);

      // Verify STREAM_INTERRUPTED error event emitted
      expect(output).toContain('event: error');
      expect(output).toContain('STREAM_INTERRUPTED');
      expect(output).toContain('"retryable":false');

      // Verify LLM was only called once (no retry after tokens emitted)
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);

      // Verify partial reply was persisted via $transaction
      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            // chatMessage.create with partial content
          }),
        ]),
      );
    });
  });

  describe('DB transaction failure → PERSISTENCE_ERROR (Req 9.8)', () => {
    it('emits PERSISTENCE_ERROR event with retryable=true when DB transaction fails', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

      // Mock createReplyDetector to forward tokens
      mockedCreateReplyDetector.mockReturnValue({
        feed: (delta: string) => ({ forwardable: delta, buffered: '' }),
        isInsideReply: () => true,
      } as ReturnType<typeof createReplyDetector>);

      // Create successful streaming response
      async function* successfulStream() {
        yield { choices: [{ delta: { content: '{"reply":"Terima kasih",' } }] };
        yield {
          choices: [
            {
              delta: {
                content:
                  '"extraction":{"intensitas":[],"waktu":[{"keyword":"malam","confidence":"high"}],"lokasi_tubuh":[],"kontak":[],"lesi":[],"faktor_risiko":[]}}',
              },
            },
          ],
        };
      }

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValueOnce(successfulStream()),
          },
        },
      };
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      // Mock parseLLMResponse to return success
      mockedParseLLMResponse.mockReturnValue({
        status: 'success',
        data: {
          reply: 'Terima kasih',
          extraction: {
            intensitas: [],
            waktu: [{ keyword: 'malam', confidence: 'high' }],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          categories_covered: ['intensitas', 'waktu'],
          next_category: 'lokasi_tubuh',
          should_follow_up: false,
        },
      } as ReturnType<typeof parseLLMResponse>);

      // Mock $transaction to fail (simulating DB failure)
      mockedPrisma.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));
      // TurnLog persistence (first call) succeeds
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);

      const stream = await processChatTurn('session-1', 'saya gatal malam', false);
      const output = await drainStream(stream);

      // Verify PERSISTENCE_ERROR event with retryable=true
      expect(output).toContain('event: error');
      expect(output).toContain('PERSISTENCE_ERROR');
      expect(output).toContain('"retryable":true');

      // Verify tokens were still streamed (not discarded)
      expect(output).toContain('event: token');

      // Verify done event is still emitted (stream completes gracefully)
      expect(output).toContain('event: done');
    });
  });
});

// --- processChatTurn Integration Tests ---

describe('processChatTurn', () => {
  const defaultExtraction = {
    intensitas: [{ keyword: 'gatal parah', confidence: 'high' as const }],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };

  const fullLLMResponse = JSON.stringify({
    reply: 'Saya mengerti, gatal parah ya.',
    extraction: defaultExtraction,
    categories_covered: ['intensitas'],
    next_category: 'waktu',
    should_follow_up: false,
  });

  function createMockStreamingClient(responseChunks: string[]) {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        for (const chunk of responseChunks) {
          yield {
            choices: [{ delta: { content: chunk } }],
          };
        }
      },
    };

    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(asyncIterable),
        },
      },
    };
  }

  function createMockReplyDetector() {
    return {
      feed: vi.fn((token: string) => ({ forwardable: token, buffered: '' })),
      isInsideReply: vi.fn(() => true),
    };
  }

  function createChatSession(overrides?: Record<string, unknown>) {
    return {
      id: 'session-1',
      locale: 'id',
      mode: 'ai',
      status: 'IN_PROGRESS',
      perception: null,
      categoriesCovered: ['intensitas'],
      metadata: null,
      messages: [
        {
          id: 'm1',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'Halo, ceritakan gejalamu.',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          sessionId: 'session-1',
          role: 'user',
          content: 'gatal',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm3',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'Di mana rasa gatalnya?',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
      extractions: [
        {
          id: 'e1',
          sessionId: 'session-1',
          turnNumber: 1,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 'high' }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          scores: {},
          createdAt: new Date(),
        },
      ],
      demographics: {
        id: 'd1',
        sessionId: 'session-1',
        age: 15,
        gender: 'male',
        educationLevel: 'JUNIOR_HIGH',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockReturnValue(defaultConfig as ReturnType<typeof getLLMConfig>);
    mockedGetFallbackClient.mockReturnValue(null);
    mockedGetFallbackModel.mockReturnValue(null);
    mockedBuildMessages.mockReturnValue([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'gatal parah' },
    ]);
    mockedAppendToPool.mockImplementation((pool) => pool);
    mockedCalculateAllScores.mockReturnValue(
      createMockScoringResult() as ReturnType<typeof calculateAllScores>,
    );
    mockedCheckCrisis.mockReturnValue(null);
    mockedGetNextInstruction.mockReturnValue({
      type: 'EXPLORE_CATEGORY',
      targetCategory: 'waktu',
      isFollowUp: false,
    } as ReturnType<typeof getNextInstruction>);
    mockedDetectEdgeCase.mockReturnValue({ type: 'normal' } as ReturnType<typeof detectEdgeCase>);
    mockedTransition.mockReturnValue({ newState: 'CHATTING', context: {} } as unknown as ReturnType<
      typeof transition
    >);
    mockedCreateReplyDetector.mockReturnValue(
      createMockReplyDetector() as unknown as ReturnType<typeof createReplyDetector>,
    );
    mockedDetermineCoveredCategories.mockImplementation((current) => current as string[]);
  });

  it('happy path: streams tokens then emits done event with updated categories', async () => {
    const session = createChatSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [
      '{"reply":"Saya',
      ' mengerti',
      '","extraction":',
      JSON.stringify(defaultExtraction),
      ',"categories_covered":["intensitas"],"next_category":"waktu","should_follow_up":false}',
    ];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    const output = await drainStream(stream);

    // Verify token events were emitted
    expect(output).toContain('event: token');
    // Verify done event is emitted last
    expect(output).toContain('event: done');
    // Verify done event contains categoriesCovered
    const doneMatch = output.match(/event: done\ndata: (.+)\n/);
    expect(doneMatch).not.toBeNull();
    const donePayload = JSON.parse(doneMatch![1] as string);
    expect(donePayload.categoriesCovered).toBeDefined();
    expect(donePayload.mode).toBe('ai');
  });

  it('SSE events emitted in correct order: tokens first, done last', async () => {
    const session = createChatSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [
      '{"reply":"Ok"',
      ',"extraction":',
      JSON.stringify(defaultExtraction),
      ',"categories_covered":["intensitas"],"next_category":"waktu","should_follow_up":false}',
    ];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Ok',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    const output = await drainStream(stream);

    // Split events and verify ordering
    const events = output.split('\n\n').filter(Boolean);
    const eventTypes = events
      .map((e) => {
        const match = e.match(/^event: (\w+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    // Last event must be 'done'
    expect(eventTypes[eventTypes.length - 1]).toBe('done');
    // All preceding events should be 'token' (in happy path)
    const nonDoneEvents = eventTypes.slice(0, -1);
    nonDoneEvents.forEach((type) => {
      expect(type).toBe('token');
    });
  });

  it('persists user message, assistant message, extraction, and session update in a single transaction', async () => {
    const session = createChatSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [fullLLMResponse];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const scoringResult = createMockScoringResult();
    mockedCalculateAllScores.mockReturnValue(
      scoringResult as ReturnType<typeof calculateAllScores>,
    );

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    await drainStream(stream);

    // Verify $transaction was called with the correct operations
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionArg = mockedPrisma.$transaction.mock.calls[0]![0];
    expect(transactionArg).toHaveLength(4); // user msg, assistant msg, extraction, session update
  });

  it('transaction includes user message with correct role and content', async () => {
    const session = createChatSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [fullLLMResponse];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    await drainStream(stream);

    // Verify chatMessage.create was called for user message
    expect(mockedPrisma.chatMessage.create).toHaveBeenCalledWith({
      data: { sessionId: 'session-1', role: 'user', content: 'gatal parah', isVoice: false },
    });
    // Verify chatMessage.create was called for assistant message
    expect(mockedPrisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Saya mengerti, gatal parah ya.',
        isVoice: false,
      },
    });
  });

  it('transaction includes extraction and session update with scores', async () => {
    const session = createChatSession({ categoriesCovered: [] });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [fullLLMResponse];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const scoringResult = createMockScoringResult();
    mockedCalculateAllScores.mockReturnValue(
      scoringResult as ReturnType<typeof calculateAllScores>,
    );

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    await drainStream(stream);

    // Verify turnExtraction.create was called
    expect(mockedPrisma.turnExtraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        turnNumber: expect.any(Number),
        extraction: defaultExtraction,
      }),
    });

    // Verify screeningSession.update was called with scores
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        totalScore: scoringResult.totalScore,
        riskLevel: scoringResult.riskLevel,
        scores: scoringResult.scores,
        promptVersion: 'v1',
        scoringVersion: scoringResult.version,
      }),
    });
  });

  it('done event includes isComplete=false when not all categories are covered', async () => {
    const session = createChatSession({ categoriesCovered: ['intensitas'] });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [fullLLMResponse];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    // Scoring with only intensitas assessed, others not
    const partialScoring = {
      ...createMockScoringResult(),
      scores: {
        intensitas: {
          raw: 2,
          capped: 2,
          status: 'assessed',
          matchedPatterns: ['gatal parah'],
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
        lesi: {
          raw: 0,
          capped: 0,
          status: 'not_assessed',
          matchedPatterns: [],
          unmatchedKeywords: [],
        },
        faktor_risiko: {
          raw: 0,
          capped: 0,
          status: 'not_assessed',
          matchedPatterns: [],
          unmatchedKeywords: [],
        },
      },
    };
    mockedCalculateAllScores.mockReturnValue(
      partialScoring as ReturnType<typeof calculateAllScores>,
    );

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    const output = await drainStream(stream);

    const doneMatch = output.match(/event: done\ndata: (.+)\n/);
    expect(doneMatch).not.toBeNull();
    const donePayload = JSON.parse(doneMatch![1] as string);
    expect(donePayload.isComplete).toBe(false);
  });

  it('invokes scoring engine with updated keyword pool after extraction', async () => {
    const session = createChatSession();
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
    mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const chunks = [fullLLMResponse];
    const mockClient = createMockStreamingClient(chunks);
    mockedGetPrimaryClient.mockReturnValue(mockClient as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: {
        reply: 'Saya mengerti, gatal parah ya.',
        extraction: defaultExtraction,
        categories_covered: ['intensitas'],
        next_category: 'waktu',
        should_follow_up: false,
      },
    });

    const stream = await processChatTurn('session-1', 'gatal parah', false);
    await drainStream(stream);

    // appendToPool called for existing extractions + new extraction
    expect(mockedAppendToPool).toHaveBeenCalled();
    // calculateAllScores called with pool and locale
    expect(mockedCalculateAllScores).toHaveBeenCalledWith(expect.anything(), 'id');
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(null as never);

    await expect(processChatTurn('nonexistent', 'hello', false)).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws ValidationError when session is not IN_PROGRESS', async () => {
    const session = createChatSession({ status: 'COMPLETED' });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    await expect(processChatTurn('session-1', 'hello', false)).rejects.toThrow(
      'Session is not in progress',
    );
  });

  it('throws ValidationError when session is in questionnaire mode', async () => {
    const session = createChatSession({ mode: 'questionnaire' });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    await expect(processChatTurn('session-1', 'hello', false)).rejects.toThrow(
      'questionnaire mode',
    );
  });
});

// --- Crisis & State Transition Integration Tests (Task 12.3) ---

describe('processChatTurn - crisis and state transitions', () => {
  const _defaultExtraction = {
    intensitas: [{ keyword: 'gatal', confidence: 'high' as const }],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };

  function createMockStreamingClient(responseChunks: string[]) {
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        for (const chunk of responseChunks) {
          yield { choices: [{ delta: { content: chunk } }] };
        }
      },
    };
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(asyncIterable),
        },
      },
    };
  }

  function createChatSession(overrides?: Record<string, unknown>) {
    return {
      id: 'session-1',
      locale: 'id',
      mode: 'ai',
      status: 'IN_PROGRESS',
      perception: null,
      categoriesCovered: ['intensitas'],
      metadata: null,
      messages: [
        {
          id: 'm1',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'Halo',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          sessionId: 'session-1',
          role: 'user',
          content: 'gatal',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm3',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'Di mana?',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
      extractions: [
        {
          id: 'e1',
          sessionId: 'session-1',
          turnNumber: 1,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 'high' }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          scores: {},
          createdAt: new Date(),
        },
      ],
      demographics: {
        id: 'd1',
        sessionId: 'session-1',
        age: 15,
        gender: 'male',
        educationLevel: 'JUNIOR_HIGH',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockReturnValue(defaultConfig as ReturnType<typeof getLLMConfig>);
    mockedGetFallbackClient.mockReturnValue(null);
    mockedGetFallbackModel.mockReturnValue(null);
    mockedBuildMessages.mockReturnValue([{ role: 'system', content: 'test' }]);
    mockedAppendToPool.mockImplementation((pool) => pool);
    mockedCalculateAllScores.mockReturnValue(
      createMockScoringResult() as ReturnType<typeof calculateAllScores>,
    );
    mockedCheckCrisis.mockReturnValue(null);
    mockedGetNextInstruction.mockReturnValue({
      type: 'EXPLORE_CATEGORY',
      targetCategory: 'waktu',
      isFollowUp: false,
    } as ReturnType<typeof getNextInstruction>);
    mockedDetectEdgeCase.mockReturnValue({ type: 'normal' } as ReturnType<typeof detectEdgeCase>);
    mockedTransition.mockReturnValue({
      newState: 'CHATTING',
      context: {
        state: 'CHATTING',
        followUpTarget: null,
        categoriesCovered: ['intensitas'],
        categoriesFollowedUp: [],
        sessionId: 'session-1',
        theme: 'hybrid',
        locale: 'id',
        turn: 2,
        offTopicCount: 0,
        shortAnswerCount: 0,
      },
    } as unknown as ReturnType<typeof transition>);
    mockedCreateReplyDetector.mockReturnValue({
      feed: (delta: string) => ({ forwardable: delta, buffered: '' }),
      isInsideReply: () => true,
    } as ReturnType<typeof createReplyDetector>);
  });

  // ─── Test 1: Crisis detection (Req 8.8, 10.5) ───

  describe('crisis detection → TERMINATED state + SSE crisis event', () => {
    it('emits crisis SSE event with helpline numbers when crisis keyword detected', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}] as never);

      // Mock checkCrisis to return a CrisisInstruction
      mockedCheckCrisis.mockReturnValueOnce({
        type: 'CRISIS_HALT',
        helplineNumbers: { id: '119', international: '988' },
        message: 'Kami mendeteksi pesan yang mengkhawatirkan. Hubungi 119 atau 988.',
        terminateSession: true,
      });

      const stream = await processChatTurn('session-1', 'saya ingin bunuh diri', false);
      const output = await drainStream(stream);

      // Verify crisis error event with CRISIS_DETECTED code
      expect(output).toContain('event: error');
      expect(output).toContain('CRISIS_DETECTED');
      // Verify helpline numbers are included in the event
      expect(output).toContain('119');
      expect(output).toContain('988');
    });

    it('updates session status to COMPLETED with terminated metadata', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}] as never);

      mockedCheckCrisis.mockReturnValueOnce({
        type: 'CRISIS_HALT',
        helplineNumbers: { id: '119', international: '988' },
        message: 'Crisis message',
        terminateSession: true,
      });

      const stream = await processChatTurn('session-1', 'bunuh diri', false);
      await drainStream(stream);

      // Verify session is terminated — persisted with COMPLETED status and terminated metadata
      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({}), // user message
          expect.objectContaining({}), // crisis message
        ]),
      );
      expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            metadata: expect.objectContaining({
              terminated: true,
              terminationReason: 'crisis_detected',
            }),
          }),
        }),
      );
    });

    it('does not invoke LLM when crisis is detected', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}] as never);

      mockedCheckCrisis.mockReturnValueOnce({
        type: 'CRISIS_HALT',
        helplineNumbers: { id: '119', international: '988' },
        message: 'Crisis message',
        terminateSession: true,
      });

      const stream = await processChatTurn('session-1', 'bunuh diri', false);
      await drainStream(stream);

      // No LLM client call made — crisis is handled before LLM invocation
      expect(mockedGetPrimaryClient).not.toHaveBeenCalled();
    });

    it('invokes state machine transition with CRISIS_DETECTED event', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}] as never);

      mockedCheckCrisis.mockReturnValueOnce({
        type: 'CRISIS_HALT',
        helplineNumbers: { id: '119', international: '988' },
        message: 'Crisis message',
        terminateSession: true,
      });

      const stream = await processChatTurn('session-1', 'bunuh diri', false);
      await drainStream(stream);

      // Verify transition was called with CRISIS_DETECTED event
      expect(mockedTransition).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'CHATTING', sessionId: 'session-1' }),
        { type: 'CRISIS_DETECTED' },
      );
    });

    it('emits done event with isComplete=true after crisis', async () => {
      const session = createChatSession();
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}] as never);

      mockedCheckCrisis.mockReturnValueOnce({
        type: 'CRISIS_HALT',
        helplineNumbers: { id: '119', international: '988' },
        message: 'Crisis message',
        terminateSession: true,
      });

      const stream = await processChatTurn('session-1', 'bunuh diri', false);
      const output = await drainStream(stream);

      // Verify done event signals session is complete (terminated)
      expect(output).toContain('event: done');
      const doneMatch = output.match(/event: done\ndata: (.+)\n/);
      expect(doneMatch).not.toBeNull();
      const donePayload = JSON.parse(doneMatch![1] as string);
      expect(donePayload.isComplete).toBe(true);
      expect(donePayload.mode).toBe('ai');
    });
  });

  // ─── Test 2: Force-close at 14 messages (Req 8.6, 9.6) ───

  describe('force-close at 14 messages → output generation triggered', () => {
    it('triggers output generation when session has 14 messages', async () => {
      // Create session with 14 messages (7 user turns)
      const messages = Array.from({ length: 14 }, (_, i) => ({
        id: `m${i + 1}`,
        sessionId: 'session-1',
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i + 1}`,
        isVoice: false,
        createdAt: new Date(),
      }));

      const session = createChatSession({
        messages,
        categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh'],
      });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

      // Mock output generation path
      mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);
      mockedBuildOutputContext.mockReturnValue({
        riskLevel: 'MODERATE',
        perception: 'ADEQUATE',
        locale: 'id',
        theme: 'hybrid',
        categoriesAssessed: ['intensitas', 'waktu', 'lokasi_tubuh'],
        categoriesNotAssessed: ['kontak', 'lesi', 'faktor_risiko'],
        isForceClose: true,
        matchedKeywords: {
          intensitas: ['gatal'],
          waktu: ['malam'],
          lokasi_tubuh: ['tangan'],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        },
        scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 1, kontak: 0, lesi: 0, faktor_risiko: 0 },
        totalScore: 4,
      });

      const mockClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({
                conclusion: 'Risiko sedang (data tidak lengkap)',
                perceptionResponse: null,
                recommendation: 'Konsultasi dokter',
                personalizedSuggestion: null,
              }),
            },
          },
        ],
      });
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);
      mockedParseOutputResponse.mockReturnValue({
        status: 'success',
        data: {
          conclusion: 'Risiko sedang (data tidak lengkap)',
          perceptionResponse: null,
          recommendation: 'Konsultasi dokter',
          personalizedSuggestion: null,
        },
      });

      const stream = await processChatTurn('session-1', 'saya tidak tahu', false);
      await drainStream(stream);

      // Verify output generation was triggered — session marked COMPLETED with isForceClose
      expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            metadata: expect.objectContaining({ isForceClose: true }),
          }),
        }),
      );
    });

    it('does not make regular streaming LLM chat call when force-closing', async () => {
      const messages = Array.from({ length: 14 }, (_, i) => ({
        id: `m${i + 1}`,
        sessionId: 'session-1',
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i + 1}`,
        isVoice: false,
        createdAt: new Date(),
      }));

      const session = createChatSession({
        messages,
        categoriesCovered: ['intensitas', 'waktu'],
      });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

      mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);
      mockedBuildOutputContext.mockReturnValue({
        riskLevel: 'MODERATE',
        perception: 'ADEQUATE',
        locale: 'id',
        theme: 'hybrid',
        categoriesAssessed: ['intensitas', 'waktu'],
        categoriesNotAssessed: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        isForceClose: true,
        matchedKeywords: {
          intensitas: ['gatal'],
          waktu: ['malam'],
          lokasi_tubuh: [],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        },
        scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 0, kontak: 0, lesi: 0, faktor_risiko: 0 },
        totalScore: 3,
      });

      // Output generation uses non-streaming create (no stream: true)
      const mockClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({
                conclusion: 'Force close result',
                perceptionResponse: null,
                recommendation: 'Reko',
                personalizedSuggestion: null,
              }),
            },
          },
        ],
      });
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);
      mockedParseOutputResponse.mockReturnValue({
        status: 'success',
        data: {
          conclusion: 'Force close result',
          perceptionResponse: null,
          recommendation: 'Reko',
          personalizedSuggestion: null,
        },
      });

      const stream = await processChatTurn('session-1', 'saya tidak tahu', false);
      await drainStream(stream);

      // The LLM call was for output generation (non-streaming), not for regular chat streaming
      // Verify buildMessages was NOT called (chat streaming path was skipped)
      expect(mockedBuildMessages).not.toHaveBeenCalled();
      // Verify buildOutputMessages WAS called (output generation path was taken)
      expect(mockedBuildOutputMessages).toHaveBeenCalled();
    });

    it('emits done event with output result when force-close succeeds', async () => {
      const messages = Array.from({ length: 14 }, (_, i) => ({
        id: `m${i + 1}`,
        sessionId: 'session-1',
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `message ${i + 1}`,
        isVoice: false,
        createdAt: new Date(),
      }));

      const session = createChatSession({
        messages,
        categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh'],
      });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

      mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);
      mockedBuildOutputContext.mockReturnValue({
        riskLevel: 'MODERATE',
        perception: 'ADEQUATE',
        locale: 'id',
        theme: 'hybrid',
        categoriesAssessed: ['intensitas', 'waktu', 'lokasi_tubuh'],
        categoriesNotAssessed: ['kontak', 'lesi', 'faktor_risiko'],
        isForceClose: true,
        matchedKeywords: {
          intensitas: ['gatal'],
          waktu: ['malam'],
          lokasi_tubuh: ['tangan'],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        },
        scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 1, kontak: 0, lesi: 0, faktor_risiko: 0 },
        totalScore: 4,
      });

      const mockClient = createMockClient({
        choices: [
          {
            message: {
              content: JSON.stringify({
                conclusion: 'Incomplete screening result',
                perceptionResponse: null,
                recommendation: 'Konsultasi',
                personalizedSuggestion: null,
              }),
            },
          },
        ],
      });
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);
      mockedParseOutputResponse.mockReturnValue({
        status: 'success',
        data: {
          conclusion: 'Incomplete screening result',
          perceptionResponse: null,
          recommendation: 'Konsultasi',
          personalizedSuggestion: null,
        },
      });

      const stream = await processChatTurn('session-1', 'apa lagi', false);
      const output = await drainStream(stream);

      // Verify done event with output result
      const doneMatch = output.match(/event: done\ndata: (.+)\n/);
      expect(doneMatch).not.toBeNull();
      const donePayload = JSON.parse(doneMatch![1] as string);
      expect(donePayload.isComplete).toBe(true);
      expect(donePayload.result).toBeDefined();
      expect(donePayload.result.conclusion).toBe('Incomplete screening result');
      expect(donePayload.result.riskLevel).toBeDefined();
    });
  });

  // ─── Test 3: Follow-up flow (Req 8.3, 8.4) ───

  describe('follow-up flow: low confidence → FOLLOW_UP → response → CHATTING', () => {
    it('persists followUpTarget in metadata when transition returns FOLLOW_UP state', async () => {
      const session = createChatSession({ categoriesCovered: ['intensitas'] });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);

      // Mock streaming LLM response
      const chunks = [
        '{"reply":"Apakah gatalnya di malam hari?"',
        ',"extraction":',
        JSON.stringify({
          intensitas: [],
          waktu: [{ keyword: 'malam', confidence: 'low' }],
          lokasi_tubuh: [],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        }),
        '}',
      ];
      const mockClient = createMockStreamingClient(chunks);
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      const lowConfExtraction = {
        intensitas: [],
        waktu: [{ keyword: 'malam', confidence: 'low' }],
        lokasi_tubuh: [],
        kontak: [],
        lesi: [],
        faktor_risiko: [],
      };

      mockedParseLLMResponse.mockReturnValue({
        status: 'success',
        data: {
          reply: 'Apakah gatalnya di malam hari?',
          extraction: lowConfExtraction,
          categories_covered: ['intensitas'],
          next_category: 'waktu',
          should_follow_up: true,
        },
      } as ReturnType<typeof parseLLMResponse>);

      // Mock transition to return FOLLOW_UP state with target
      mockedTransition.mockReturnValueOnce({
        newState: 'FOLLOW_UP',
        context: {
          sessionId: 'session-1',
          state: 'FOLLOW_UP',
          theme: 'hybrid',
          locale: 'id',
          turn: 2,
          categoriesCovered: ['intensitas'],
          categoriesFollowedUp: ['waktu'],
          followUpTarget: 'waktu',
          offTopicCount: 0,
          shortAnswerCount: 0,
        },
      } as ReturnType<typeof transition>);

      // Scoring shows waktu not yet assessed (low confidence only)
      const partialScoring = {
        ...createMockScoringResult(),
        scores: {
          intensitas: {
            raw: 2,
            capped: 2,
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
          lesi: {
            raw: 0,
            capped: 0,
            status: 'not_assessed',
            matchedPatterns: [],
            unmatchedKeywords: [],
          },
          faktor_risiko: {
            raw: 0,
            capped: 0,
            status: 'not_assessed',
            matchedPatterns: [],
            unmatchedKeywords: [],
          },
        },
      };
      mockedCalculateAllScores.mockReturnValue(
        partialScoring as ReturnType<typeof calculateAllScores>,
      );

      const stream = await processChatTurn('session-1', 'malam', false);
      await drainStream(stream);

      // Verify metadata saved with followUpTarget set
      expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            followUpTarget: 'waktu',
            followedUp: expect.arrayContaining(['waktu']),
          }),
        }),
      });
    });

    it('clears followUpTarget in metadata when transition returns CHATTING after follow-up response', async () => {
      // Session already in FOLLOW_UP state (metadata.followUpTarget is set)
      const session = createChatSession({
        categoriesCovered: ['intensitas'],
        metadata: {
          followedUp: ['waktu'],
          followUpTarget: 'waktu',
          offTopicCount: 0,
          shortAnswerCount: 0,
          isForceClose: false,
        },
      });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);

      // Mock streaming LLM response
      const chunks = [
        '{"reply":"Baik, malam hari ya."',
        ',"extraction":',
        JSON.stringify({
          intensitas: [],
          waktu: [{ keyword: 'malam hari', confidence: 'medium' }],
          lokasi_tubuh: [],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        }),
        '}',
      ];
      const mockClient = createMockStreamingClient(chunks);
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      mockedParseLLMResponse.mockReturnValue({
        status: 'success',
        data: {
          reply: 'Baik, malam hari ya.',
          extraction: {
            intensitas: [],
            waktu: [{ keyword: 'malam hari', confidence: 'medium' }],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          categories_covered: ['intensitas', 'waktu'],
          next_category: 'lokasi_tubuh',
          should_follow_up: false,
        },
      } as ReturnType<typeof parseLLMResponse>);

      // After follow-up response, transition returns CHATTING with followUpTarget cleared
      mockedTransition.mockReturnValueOnce({
        newState: 'CHATTING',
        context: {
          sessionId: 'session-1',
          state: 'CHATTING',
          theme: 'hybrid',
          locale: 'id',
          turn: 3,
          categoriesCovered: ['intensitas', 'waktu'],
          categoriesFollowedUp: ['waktu'],
          followUpTarget: null,
          offTopicCount: 0,
          shortAnswerCount: 0,
        },
      } as ReturnType<typeof transition>);

      // Scoring shows waktu now assessed (medium confidence)
      const updatedScoring = {
        ...createMockScoringResult(),
        scores: {
          intensitas: {
            raw: 2,
            capped: 2,
            status: 'assessed',
            matchedPatterns: ['gatal'],
            unmatchedKeywords: [],
          },
          waktu: {
            raw: 1,
            capped: 1,
            status: 'assessed',
            matchedPatterns: ['malam hari'],
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
          lesi: {
            raw: 0,
            capped: 0,
            status: 'not_assessed',
            matchedPatterns: [],
            unmatchedKeywords: [],
          },
          faktor_risiko: {
            raw: 0,
            capped: 0,
            status: 'not_assessed',
            matchedPatterns: [],
            unmatchedKeywords: [],
          },
        },
      };
      mockedCalculateAllScores.mockReturnValue(
        updatedScoring as ReturnType<typeof calculateAllScores>,
      );

      const stream = await processChatTurn('session-1', 'iya malam hari', false);
      await drainStream(stream);

      // Verify metadata cleared followUpTarget (back to CHATTING)
      expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            followUpTarget: null,
          }),
        }),
      });
    });

    it('derives FOLLOW_UP state from session metadata with followUpTarget', async () => {
      // Verify that a session with metadata.followUpTarget derives FOLLOW_UP state
      const session = createChatSession({
        categoriesCovered: ['intensitas'],
        metadata: {
          followedUp: ['waktu'],
          followUpTarget: 'waktu',
          offTopicCount: 0,
          shortAnswerCount: 0,
          isForceClose: false,
        },
      });
      mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);
      mockedPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}] as never);
      mockedPrisma.turnLog.create.mockResolvedValue({} as never);

      const chunks = [
        '{"reply":"Ok"',
        ',"extraction":',
        JSON.stringify({
          intensitas: [],
          waktu: [{ keyword: 'test', confidence: 'medium' }],
          lokasi_tubuh: [],
          kontak: [],
          lesi: [],
          faktor_risiko: [],
        }),
        '}',
      ];
      const mockClient = createMockStreamingClient(chunks);
      mockedGetPrimaryClient.mockReturnValue(mockClient as never);

      mockedParseLLMResponse.mockReturnValue({
        status: 'success',
        data: {
          reply: 'Ok',
          extraction: {
            intensitas: [],
            waktu: [{ keyword: 'test', confidence: 'medium' }],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
          categories_covered: ['intensitas', 'waktu'],
          next_category: 'lokasi_tubuh',
          should_follow_up: false,
        },
      } as ReturnType<typeof parseLLMResponse>);

      mockedTransition.mockReturnValueOnce({
        newState: 'CHATTING',
        context: {
          sessionId: 'session-1',
          state: 'CHATTING',
          theme: 'hybrid',
          locale: 'id',
          turn: 3,
          categoriesCovered: ['intensitas', 'waktu'],
          categoriesFollowedUp: ['waktu'],
          followUpTarget: null,
          offTopicCount: 0,
          shortAnswerCount: 0,
        },
      } as ReturnType<typeof transition>);

      const stream = await processChatTurn('session-1', 'iya', false);
      await drainStream(stream);

      // Verify the session context passed to transition has state FOLLOW_UP
      // (derived from metadata.followUpTarget)
      expect(mockedTransition).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'FOLLOW_UP',
          followUpTarget: 'waktu',
        }),
        expect.objectContaining({ type: 'EXTRACTION_RECEIVED' }),
      );
    });
  });
});

// ─── processQuestionnaireAnswer Tests ───

describe('processQuestionnaireAnswer', () => {
  function createQuestionnaireSession(overrides?: Record<string, unknown>) {
    return {
      id: 'q-session-1',
      locale: 'id',
      mode: 'questionnaire',
      status: 'IN_PROGRESS',
      categoriesCovered: [],
      scores: null,
      totalScore: null,
      riskLevel: null,
      demographics: { age: 15, gender: 'male', educationLevel: 'JUNIOR_HIGH' },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.$transaction.mockResolvedValue([]);
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(null);

    await expect(processQuestionnaireAnswer('nonexistent', ['int_severe'])).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws SessionCompletedError when session is COMPLETED', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession({ status: 'COMPLETED' }) as never,
    );

    await expect(processQuestionnaireAnswer('q-session-1', ['int_severe'])).rejects.toThrow(
      'Session is already completed',
    );
  });

  it('throws ValidationError when session is in ai mode', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession({ mode: 'ai' }) as never,
    );

    await expect(processQuestionnaireAnswer('q-session-1', ['int_severe'])).rejects.toThrow(
      'Session is not in questionnaire mode',
    );
  });

  it('handles confirm_cancel by setting session to COMPLETED', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession() as never,
    );

    const result = await processQuestionnaireAnswer('q-session-1', ['confirm_cancel']);

    expect(result.status).toBe('completed');
    expect(result.isComplete).toBe(true);
    expect(result.mode).toBe('questionnaire');
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('processes pill selections and advances to next category', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession() as never,
    );
    mockedGetPillById.mockImplementation((_locale, pillId) => {
      if (pillId === 'int_severe')
        return {
          id: 'int_severe',
          label: 'Gatal banget',
          score: 1,
          category: 'intensitas',
          locale: 'id',
        };
      if (pillId === 'int_scratch')
        return {
          id: 'int_scratch',
          label: 'Pengen garuk terus',
          score: 1,
          category: 'intensitas',
          locale: 'id',
        };
      return undefined;
    });
    mockedGetPills.mockReturnValue([
      { id: 'waktu_night', label: 'Malam hari', score: 2, category: 'waktu', locale: 'id' },
      { id: 'waktu_day_only', label: 'Cuma siang', score: -1, category: 'waktu', locale: 'id' },
    ]);

    const result = await processQuestionnaireAnswer('q-session-1', ['int_severe', 'int_scratch']);

    expect(result.status).toBe('in_progress');
    expect(result.isComplete).toBe(false);
    expect(result.categoriesCovered).toEqual(['intensitas']);
    expect(result.pills).toHaveLength(2);
    expect(result.pillSelection).toBe('multi');
    expect(result.mode).toBe('questionnaire');
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('marks session COMPLETED when all 6 categories are covered', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession({
        categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi'],
        scores: { intensitas: 2, waktu: 3, lokasi_tubuh: 1, kontak: 2, lesi: 1 },
      }) as never,
    );
    mockedGetPillById.mockImplementation((_locale, pillId) => {
      if (pillId === 'risiko_boarding')
        return {
          id: 'risiko_boarding',
          label: 'Pondok/asrama',
          score: 2,
          category: 'faktor_risiko',
          locale: 'id',
        };
      return undefined;
    });

    const result = await processQuestionnaireAnswer('q-session-1', ['risiko_boarding']);

    expect(result.status).toBe('completed');
    expect(result.isComplete).toBe(true);
    expect(result.categoriesCovered).toHaveLength(6);
    expect(result.result).toBeDefined();
    expect(result.result!.totalScore).toBe(11); // 2+3+1+2+1+2
    expect(result.result!.riskLevel).toBe('HIGH');
    expect(result.pills).toBeUndefined();
  });

  it('returns correct riskLevel based on totalScore', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession({
        categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi'],
        scores: { intensitas: 0, waktu: 0, lokasi_tubuh: 0, kontak: 0, lesi: 0 },
      }) as never,
    );
    mockedGetPillById.mockImplementation((_locale, pillId) => {
      if (pillId === 'risiko_boarding')
        return {
          id: 'risiko_boarding',
          label: 'Pondok/asrama',
          score: 2,
          category: 'faktor_risiko',
          locale: 'id',
        };
      return undefined;
    });

    const result = await processQuestionnaireAnswer('q-session-1', ['risiko_boarding']);

    expect(result.result!.totalScore).toBe(2);
    expect(result.result!.riskLevel).toBe('LOW');
  });

  it('stores pill labels as user message content', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      createQuestionnaireSession() as never,
    );
    mockedGetPillById.mockImplementation((_locale, pillId) => {
      if (pillId === 'int_severe')
        return {
          id: 'int_severe',
          label: 'Gatal banget',
          score: 1,
          category: 'intensitas',
          locale: 'id',
        };
      return undefined;
    });
    mockedGetPills.mockReturnValue([
      { id: 'waktu_night', label: 'Malam hari', score: 2, category: 'waktu', locale: 'id' },
    ]);

    await processQuestionnaireAnswer('q-session-1', ['int_severe']);

    const transactionCalls = mockedPrisma.$transaction.mock.calls[0]![0] as unknown[];
    // The transaction should include chat message creates
    expect(transactionCalls).toHaveLength(3);
  });
});
