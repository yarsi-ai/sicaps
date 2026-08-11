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
  getFallbackOutput: vi.fn(),
}));

vi.mock('@/features/screening-chat-v1/internal', () => ({
  parseLLMResponse: vi.fn(),
  parseOutputResponse: vi.fn(),
  buildMessages: vi.fn(),
  buildOutputMessages: vi.fn(),
  encodeSSE: vi.fn(
    (event: unknown) =>
      `event: ${(event as { event: string }).event}\ndata: ${JSON.stringify((event as { data: unknown }).data)}\n\n`,
  ),
  createReplyDetector: vi.fn(),
  extractReplyFromPartial: vi.fn(),
  PROMPT_VERSION: 'v1',
  appendToPool: vi.fn(),
  calculateAllScores: vi.fn(),
  getPills: vi.fn(),
}));

import { prisma } from '@/db/prisma';
import {
  getPrimaryClient,
  getFallbackClient,
  getLLMConfig,
  getFallbackModel,
  getFallbackOutput,
} from '@/lib/llm';
import {
  parseLLMResponse,
  parseOutputResponse,
  buildMessages,
  buildOutputMessages,
  createReplyDetector,
  extractReplyFromPartial,
  appendToPool,
  calculateAllScores,
  getPills,
} from '@/features/screening-chat-v1/internal';
import { checkLLMHealth, processChatTurn, generateOutput } from './llm.service';

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
const mockedGetFallbackOutput = vi.mocked(getFallbackOutput);
const mockedExtractReplyFromPartial = vi.mocked(extractReplyFromPartial);
const mockedAppendToPool = vi.mocked(appendToPool);
const mockedCalculateAllScores = vi.mocked(calculateAllScores);
const mockedGetPills = vi.mocked(getPills);

// --- Helpers ---

const defaultConfig = {
  model: 'qwen2.5:7b',
  temperatureChat: 0.3,
  temperatureOutput: 0.6,
  maxTokensChat: 500,
  maxTokensOutput: 800,
  topP: 0.9,
  timeoutMs: 12000,
  retryTimeoutMs: 12000,
  healthTimeoutMs: 5000,
};

function createMockStream(chunks: Array<{ choices: Array<{ delta: { content?: string } }> }>) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    locale: 'id',
    mode: 'ai',
    status: 'IN_PROGRESS',
    categoriesCovered: [],
    promptVersion: 'v1',
    scoringVersion: 'v1',
    perception: null,
    demographics: { age: 16, gender: 'male' },
    messages: [],
    extractions: [],
    ...overrides,
  };
}

const validLLMChatResponse = {
  reply: 'Terima kasih',
  extraction: {
    intensitas: [{ keyword: 'gatal', confidence: 'high' as const }],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  },
  categories_covered: ['intensitas'],
  next_category: 'waktu',
  should_follow_up: false,
};

const validStreamChunks = [
  { choices: [{ delta: { content: '{"reply":"Terima' } }] },
  { choices: [{ delta: { content: ' kasih","extraction"' } }] },
  { choices: [{ delta: { content: ':{"intensitas":[{"keyword":"gatal","confidence":"high"}]' } }] },
  {
    choices: [
      {
        delta: {
          content: ',"waktu":[],"lokasi_tubuh":[],"kontak":[],"lesi":[],"faktor_risiko":[]}',
        },
      },
    ],
  },
  {
    choices: [
      {
        delta: {
          content:
            ',"categories_covered":["intensitas"],"next_category":"waktu","should_follow_up":false}',
        },
      },
    ],
  },
];

const emptyScoringResult = {
  version: 'v1',
  scores: {
    intensitas: {
      raw: 1,
      capped: 1,
      status: 'assessed' as const,
      matchedPatterns: ['gatal'],
      unmatchedKeywords: [],
    },
    waktu: {
      raw: 0,
      capped: 0,
      status: 'not_assessed' as const,
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    lokasi_tubuh: {
      raw: 0,
      capped: 0,
      status: 'not_assessed' as const,
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    kontak: {
      raw: 0,
      capped: 0,
      status: 'not_assessed' as const,
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    lesi: {
      raw: 0,
      capped: 0,
      status: 'not_assessed' as const,
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
    faktor_risiko: {
      raw: 0,
      capped: 0,
      status: 'not_assessed' as const,
      matchedPatterns: [],
      unmatchedKeywords: [],
    },
  },
  totalScore: 1,
  riskLevel: 'LOW' as const,
};

/** Read all SSE events from a ReadableStream */
async function readSSEStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  // Parse SSE events from buffer
  const rawEvents = buffer.split('\n\n').filter((e) => e.trim());
  for (const raw of rawEvents) {
    events.push(raw);
  }
  return events;
}

function setupDefaultMocks() {
  mockedGetLLMConfig.mockReturnValue(defaultConfig);
  mockedGetFallbackClient.mockReturnValue(null);
  mockedGetFallbackModel.mockReturnValue(null);
  mockedBuildMessages.mockReturnValue([
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'hello' },
  ]);
  mockedCreateReplyDetector.mockReturnValue({
    feed: (token: string) => ({ forwardable: token, buffered: '' }),
    isInsideReply: () => true,
  });
  mockedAppendToPool.mockReturnValue({
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  });
  mockedCalculateAllScores.mockReturnValue(emptyScoringResult);
  mockedPrisma.$transaction.mockResolvedValue([]);
}

// --- checkLLMHealth tests ---

describe('checkLLMHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockReturnValue(defaultConfig);
  });

  it('returns true when LLM responds with a valid completion', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'p' } }],
    });
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    const result = await checkLLMHealth();
    expect(result).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      {
        model: 'qwen2.5:7b',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      },
      { timeout: 5000 },
    );
  });

  it('returns false when LLM responds with empty choices array', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ choices: [] });
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    expect(await checkLLMHealth()).toBe(false);
  });

  it('returns false when the LLM call times out', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Request timed out'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    expect(await checkLLMHealth()).toBe(false);
  });

  it('returns false when the LLM returns an HTTP error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('HTTP 500'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    expect(await checkLLMHealth()).toBe(false);
  });

  it('returns false when connection is refused', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    expect(await checkLLMHealth()).toBe(false);
  });

  it('returns false when getPrimaryClient throws (missing env vars)', async () => {
    mockedGetPrimaryClient.mockImplementation(() => {
      throw new Error('Environment validation failed: LLM_BASE_URL is required');
    });
    expect(await checkLLMHealth()).toBe(false);
  });

  it('returns false when getLLMConfig throws (invalid config)', async () => {
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: vi.fn() } },
    } as never);
    mockedGetLLMConfig.mockImplementation(() => {
      throw new Error('Environment validation failed');
    });
    expect(await checkLLMHealth()).toBe(false);
  });

  it('uses healthTimeoutMs from config for the request timeout', async () => {
    mockedGetLLMConfig.mockReturnValue({ ...defaultConfig, healthTimeoutMs: 3000 });
    const mockCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    await checkLLMHealth();
    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), { timeout: 3000 });
  });

  it('never throws regardless of error type', async () => {
    mockedGetPrimaryClient.mockImplementation(() => {
      throw null;
    });
    expect(await checkLLMHealth()).toBe(false);
  });
});

// --- processChatTurn tests ---

describe('processChatTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('happy path: streams tokens and emits done with scoring', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    const mockCreate = vi.fn().mockResolvedValue(createMockStream(validStreamChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: validLLMChatResponse,
    });

    const stream = await processChatTurn('session-1', 'gatal banget', false);
    const events = await readSSEStream(stream);

    // Should have token events + done event
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);

    // Verify scoring was called
    expect(mockedAppendToPool).toHaveBeenCalled();
    expect(mockedCalculateAllScores).toHaveBeenCalled();

    // Verify persistence
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('retries on first attempt failure and succeeds on second', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockResolvedValueOnce(createMockStream(validStreamChunks));

    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: validLLMChatResponse,
    });

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Should succeed after retry
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"mode":"ai"');

    // LLM was called twice (primary failed, retry succeeded)
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('degrades to questionnaire when both attempts fail', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedExtractReplyFromPartial.mockReturnValue(null);
    mockedGetPills.mockReturnValue([
      { id: 'int_severe', label: 'Gatal banget', score: 1, category: 'intensitas', locale: 'id' },
    ]);

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Should emit done with questionnaire mode + pills
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"mode":"questionnaire"');
    expect(doneEvents[0]).toContain('pills');

    // LLM was called twice before degradation
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Session mode updated to questionnaire
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('handles partial recovery - schema invalid but reply present', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    const partialChunks = [
      { choices: [{ delta: { content: '{"reply":"Partial reply","bad":true}' } }] },
    ];
    const mockCreate = vi.fn().mockResolvedValue(createMockStream(partialChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    // First attempt: partial, second attempt: also partial (takes partial on second)
    mockedParseLLMResponse.mockReturnValue({ status: 'partial', reply: 'Partial reply' });

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Should emit done in AI mode (not degraded)
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"mode":"ai"');

    // Scoring is skipped (no extraction), but messages are still persisted
    expect(mockedCalculateAllScores).not.toHaveBeenCalled();
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('triggers generateOutput at 14 messages', async () => {
    // Create session with 14 messages (7 user turns)
    const messages14 = Array.from({ length: 14 }, (_, i) => ({
      id: `msg-${i}`,
      sessionId: 'session-1',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
      isVoice: false,
      createdAt: new Date(),
    }));

    const sessionWith14Msgs = makeSession({ messages: messages14 });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(sessionWith14Msgs as never);

    // generateOutput will be called internally - set up its dependencies
    mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conclusion: 'Kesimpulan',
              perceptionResponse: null,
              recommendation: 'Rekomendasi',
              personalizedSuggestion: null,
            }),
          },
        },
      ],
    });
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    mockedParseOutputResponse.mockReturnValue({
      status: 'success',
      data: {
        conclusion: 'Kesimpulan',
        perceptionResponse: null,
        recommendation: 'Rekomendasi',
        personalizedSuggestion: null,
      },
    });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await processChatTurn('session-1', 'message', false);
    const events = await readSSEStream(stream);

    // Should emit done with isComplete = true (output generation)
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"isComplete":true');
  });

  it('throws NotFoundError for non-existent session', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(null as never);

    await expect(processChatTurn('nonexistent', 'hello', false)).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws ValidationError for completed session', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      makeSession({ status: 'COMPLETED' }) as never,
    );

    await expect(processChatTurn('session-1', 'hello', false)).rejects.toThrow(
      'Session is not in progress',
    );
  });

  it('throws ValidationError for questionnaire mode session', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(
      makeSession({ mode: 'questionnaire' }) as never,
    );

    await expect(processChatTurn('session-1', 'hello', false)).rejects.toThrow(
      'Session is in questionnaire mode',
    );
  });

  // --- Task 2.7: TurnLog persistence tests ---

  it('creates TurnLog with parseStatus SUCCESS on full valid response', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const mockCreate = vi.fn().mockResolvedValue(createMockStream(validStreamChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: validLLMChatResponse,
    });

    const stream = await processChatTurn('session-1', 'gatal banget', false);
    await readSSEStream(stream);

    // Verify TurnLog.create was called with SUCCESS status
    expect(mockedPrisma.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        turnNumber: 1,
        userMessage: 'gatal banget',
        parseStatus: 'SUCCESS',
        parseError: null,
        model: 'qwen2.5:7b',
        promptVersion: 'v1',
        retryCount: 0,
      }),
    });

    // rawResponse should contain the streamed buffer
    const callArg = mockedPrisma.turnLog.create.mock.calls[0]![0] as {
      data: { rawResponse: string; latencyMs: number; systemMessage: string };
    };
    expect(callArg.data.rawResponse).toContain('reply');
    expect(callArg.data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(callArg.data.systemMessage).toBe('system prompt');
  });

  it('creates TurnLog with parseStatus PARTIAL when schema validation fails', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const partialChunks = [
      { choices: [{ delta: { content: '{"reply":"Partial reply","bad":true}' } }] },
    ];
    const mockCreate = vi.fn().mockResolvedValue(createMockStream(partialChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({ status: 'partial', reply: 'Partial reply' });

    const stream = await processChatTurn('session-1', 'gatal', false);
    await readSSEStream(stream);

    // Verify TurnLog.create was called with PARTIAL status and parseError set
    expect(mockedPrisma.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        turnNumber: 1,
        parseStatus: 'PARTIAL',
        parseError: expect.stringContaining('Schema validation failed'),
        retryCount: 0,
      }),
    });
  });

  it('creates TurnLog with parseStatus FAILURE when both attempts fail', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedExtractReplyFromPartial.mockReturnValue(null);
    mockedGetPills.mockReturnValue([]);

    const stream = await processChatTurn('session-1', 'gatal', false);
    await readSSEStream(stream);

    // Verify TurnLog.create was called with FAILURE status
    expect(mockedPrisma.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        turnNumber: 1,
        parseStatus: 'FAILURE',
        parseError: expect.stringContaining('Network error'),
        retryCount: 1,
      }),
    });
  });

  it('does NOT create TurnExtraction when parseStatus is PARTIAL', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const partialChunks = [
      { choices: [{ delta: { content: '{"reply":"Partial","invalid":true}' } }] },
    ];
    const mockCreate = vi.fn().mockResolvedValue(createMockStream(partialChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({ status: 'partial', reply: 'Partial' });

    const stream = await processChatTurn('session-1', 'gatal', false);
    await readSSEStream(stream);

    // $transaction should NOT include turnExtraction.create
    // In partial path, transaction only has chatMessage creates
    const transactionCalls = mockedPrisma.$transaction.mock.calls;
    for (const call of transactionCalls) {
      const _operations = call[0] as unknown as unknown[];
      // Verify turnExtraction.create was never included
      expect(mockedPrisma.turnExtraction.create).not.toHaveBeenCalled();
    }
  });

  it('post-token stream interruption: no retry, TurnLog PARTIAL, no TurnExtraction, stream closes', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    // Create a stream that emits one token then throws (post-token failure)
    const failingStream = {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index === 0) {
              index++;
              return {
                value: { choices: [{ delta: { content: 'Hello partial' } }] },
                done: false,
              };
            }
            throw new Error('Connection reset');
          },
        };
      },
    };

    const mockCreate = vi.fn().mockResolvedValue(failingStream);
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // 1. No retry — only 1 LLM attempt
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // 2. STREAM_INTERRUPTED SSE event emitted
    const errorEvents = events.filter((e) => e.includes('event: error'));
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    expect(errorEvents[0]).toContain('STREAM_INTERRUPTED');

    // 3. TurnLog created with parseStatus PARTIAL
    expect(mockedPrisma.turnLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        parseStatus: 'PARTIAL',
      }),
    });

    // 4. No TurnExtraction created
    expect(mockedPrisma.turnExtraction.create).not.toHaveBeenCalled();

    // 5. Stream closes (done event emitted)
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
  });

  it('persistence failure ($transaction throws) does not crash stream', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const mockCreate = vi.fn().mockResolvedValue(createMockStream(validStreamChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: validLLMChatResponse,
    });

    // Mock $transaction to throw (DB failure during persistence)
    mockedPrisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // 1. Stream emits PERSISTENCE_ERROR SSE event
    const errorEvents = events.filter((e) => e.includes('event: error'));
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    expect(errorEvents[0]).toContain('PERSISTENCE_ERROR');

    // 2. Done event is still emitted (stream not left hanging)
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);

    // 3. Stream completed (readSSEStream resolved without hanging)
    // The fact that we reached this assertion proves controller.close() was called
  });

  it('pool reconstruction calls appendToPool correctly with existing extractions', async () => {
    const existingExtraction = {
      id: 'ext-1',
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
    };

    const sessionWithExtractions = makeSession({
      extractions: [existingExtraction],
      messages: [
        {
          id: 'm1',
          sessionId: 'session-1',
          role: 'user',
          content: 'msg1',
          isVoice: false,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'reply1',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
    });

    mockedPrisma.screeningSession.findUnique.mockResolvedValue(sessionWithExtractions as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    const mockCreate = vi.fn().mockResolvedValue(createMockStream(validStreamChunks));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedParseLLMResponse.mockReturnValue({
      status: 'success',
      data: validLLMChatResponse,
    });

    const stream = await processChatTurn('session-1', 'semakin gatal', false);
    await readSSEStream(stream);

    // appendToPool is called once for the existing extraction (pool reconstruction)
    // and once for the new extraction (current turn)
    expect(mockedAppendToPool).toHaveBeenCalledTimes(2);

    // First call: reconstruct pool from existing TurnExtraction (turn 1)
    expect(mockedAppendToPool).toHaveBeenNthCalledWith(
      1,
      expect.any(Object), // empty pool
      existingExtraction.extraction,
      1, // turnNumber from existing extraction
    );

    // Second call: add new extraction from current turn (turn 2)
    expect(mockedAppendToPool).toHaveBeenNthCalledWith(
      2,
      expect.any(Object), // pool after first append
      validLLMChatResponse.extraction,
      2, // current turn number
    );
  });

  it('emits LLM_UNAVAILABLE error event before done when both attempts fail', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    mockedExtractReplyFromPartial.mockReturnValue(null);
    mockedGetPills.mockReturnValue([]);

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Should have error event with LLM_UNAVAILABLE code
    const errorEvents = events.filter((e) => e.includes('event: error'));
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0]).toContain('LLM_UNAVAILABLE');
    expect(errorEvents[0]).toContain('"retryable":false');

    // Error event should come BEFORE done event (ordering requirement)
    const errorIndex = events.findIndex((e) => e.includes('event: error'));
    const doneIndex = events.findIndex((e) => e.includes('event: done'));
    expect(errorIndex).toBeLessThan(doneIndex);
  });

  it('emits STREAM_INTERRUPTED error event when stream breaks after first token', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);

    // Create a stream that emits one token then throws
    const failingStream = {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index === 0) {
              index++;
              return {
                value: { choices: [{ delta: { content: 'Hello' } }] },
                done: false,
              };
            }
            throw new Error('Connection reset');
          },
        };
      },
    };

    const mockCreate = vi.fn().mockResolvedValue(failingStream);
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Should have error event with STREAM_INTERRUPTED code
    const errorEvents = events.filter((e) => e.includes('event: error'));
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0]).toContain('STREAM_INTERRUPTED');
    expect(errorEvents[0]).toContain('"retryable":false');

    // Error event should come BEFORE done event (ordering requirement)
    const errorIndex = events.findIndex((e) => e.includes('event: error'));
    const doneIndex = events.findIndex((e) => e.includes('event: done'));
    expect(errorIndex).toBeLessThan(doneIndex);

    // Should NOT have retried (no retry after first token)
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('never emits duplicate token content across retry scenarios', async () => {
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(makeSession() as never);
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);

    // Stream emits multiple distinct tokens then interrupts (post-token failure)
    const multiTokenFailingStream = {
      [Symbol.asyncIterator]() {
        let index = 0;
        const tokens = ['Hello', ' world', ' partial'];
        return {
          async next() {
            if (index < tokens.length) {
              const token = tokens[index++];
              return {
                value: { choices: [{ delta: { content: token } }] },
                done: false,
              };
            }
            throw new Error('Connection reset mid-stream');
          },
        };
      },
    };

    const mockCreate = vi.fn().mockResolvedValue(multiTokenFailingStream);
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    const stream = await processChatTurn('session-1', 'gatal', false);
    const events = await readSSEStream(stream);

    // Extract all token event contents
    const tokenEvents = events.filter((e) => e.includes('event: token'));
    const tokenContents = tokenEvents.map((e) => {
      const dataLine = e.split('\n').find((line) => line.startsWith('data:'));
      return dataLine ? JSON.parse(dataLine.replace('data: ', '')).content : '';
    });

    // Verify: each token content appears exactly once (no duplicates)
    const uniqueContents = new Set(tokenContents);
    expect(uniqueContents.size).toBe(tokenContents.length);

    // Verify: no retry occurred (tokens were emitted, so no second attempt)
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify: stream still closes properly
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
  });
});

// --- generateOutput tests ---

describe('generateOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('calls LLM and persists output on success', async () => {
    const session = makeSession({
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
          content: 'Terima kasih',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
      extractions: [
        {
          id: 'e1',
          sessionId: 'session-1',
          turnNumber: 1,
          extraction: validLLMChatResponse.extraction,
          scores: {},
        },
      ],
    });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output prompt' }]);

    const outputData = {
      conclusion: 'Risiko rendah',
      perceptionResponse: null,
      recommendation: 'Jaga kebersihan',
      personalizedSuggestion: null,
    };

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(outputData) } }],
    });
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
    mockedParseOutputResponse.mockReturnValue({ status: 'success', data: outputData });
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateOutput('session-1');
    const events = await readSSEStream(stream);

    // Should emit done with isComplete and result
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"isComplete":true');
    expect(doneEvents[0]).toContain('"conclusion":"Risiko rendah"');

    // Persists output on session
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          aiConclusion: 'Risiko rendah',
          aiRecommendation: 'Jaga kebersihan',
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('falls back to static template on LLM failure', async () => {
    const session = makeSession({
      mode: 'questionnaire',
      messages: [
        {
          id: 'm1',
          sessionId: 'session-1',
          role: 'user',
          content: 'gatal',
          isVoice: false,
          createdAt: new Date(),
        },
      ],
      extractions: [],
    });
    mockedPrisma.screeningSession.findUnique.mockResolvedValue(session as never);

    mockedBuildOutputMessages.mockReturnValue([{ role: 'system', content: 'output' }]);

    // Both LLM attempts fail
    const mockCreate = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    mockedGetPrimaryClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);

    const fallbackData = {
      conclusion: 'Kesimpulan template',
      perceptionResponse: null,
      recommendation: 'Rekomendasi template',
      personalizedSuggestion: null,
    };
    mockedGetFallbackOutput.mockReturnValue(fallbackData);
    mockedPrisma.screeningSession.update.mockResolvedValue({} as never);

    const stream = await generateOutput('session-1');
    const events = await readSSEStream(stream);

    // Should use fallback template
    const doneEvents = events.filter((e) => e.includes('event: done'));
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0]).toContain('"conclusion":"Kesimpulan template"');

    // LLM was attempted twice before fallback
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockedGetFallbackOutput).toHaveBeenCalledWith('id', expect.any(String));

    // Persists the fallback output
    expect(mockedPrisma.screeningSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiConclusion: 'Kesimpulan template',
          status: 'COMPLETED',
        }),
      }),
    );
  });
});
