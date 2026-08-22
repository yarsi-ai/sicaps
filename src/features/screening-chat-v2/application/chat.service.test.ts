import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports per vitest convention
// ---------------------------------------------------------------------------

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    turnExtraction: { create: vi.fn() },
    turnLog: { create: vi.fn() },
    screeningResult: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    unmappedPhrase: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/llm', () => ({
  getPrimaryClient: vi.fn(),
  getLLMConfig: vi.fn(() => ({
    model: 'test-model',
    maxTokensOutput: 500,
    maxTokensChat: 500,
    temperatureChat: 0.5,
    timeoutMs: 5000,
  })),
}));

vi.mock('@/lib/sanitize', () => ({
  sanitizeUserInput: vi.fn((input: string) => input),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { prisma } from '@/db/prisma';
import { getPrimaryClient } from '@/lib/llm';
import { processChatTurn } from './chat.service';
import { SessionBusyError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockUpdateMany = vi.mocked(prisma.screeningSession.updateMany);
const mockFindUniqueOrThrow = vi.mocked(prisma.screeningSession.findUniqueOrThrow);
const mockSessionUpdate = vi.mocked(prisma.screeningSession.update);
const mockMessageCreate = vi.mocked(prisma.chatMessage.create);
const mockMessageFindMany = vi.mocked(prisma.chatMessage.findMany);
const mockTurnExtractionCreate = vi.mocked(prisma.turnExtraction.create);
const mockTurnLogCreate = vi.mocked(prisma.turnLog.create);
const mockResultFindFirst = vi.mocked(prisma.screeningResult.findFirst);
const mockResultFindUnique = vi.mocked(prisma.screeningResult.findUnique);
const mockResultCreate = vi.mocked(prisma.screeningResult.create);
const mockUnmappedUpsert = vi.mocked(prisma.unmappedPhrase.upsert);
const mockAuditLogCreate = vi.mocked(prisma.auditLog.create);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockSessionFindUnique = vi.mocked(prisma.screeningSession.findUnique);
const mockGetPrimaryClient = vi.mocked(getPrimaryClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

/** Consume a ReadableStream and return the full SSE text. */
async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

/** Parse SSE events from raw text into structured objects. */
function parseSSEEvents(raw: string): Array<{ type: string; data: unknown }> {
  const events: Array<{ type: string; data: unknown }> = [];
  const blocks = raw.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let type = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7);
      if (line.startsWith('data: ')) dataStr = line.slice(6);
    }
    if (type && dataStr) {
      events.push({ type, data: JSON.parse(dataStr) });
    }
  }
  return events;
}

/** Create a fake LLM client that returns a fixed extraction JSON string. */
function createMockLLMClient(
  extractionJson: string,
  composeTokens: string[] = ['Halo', ', ', 'apa kabar?'],
) {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      for (const token of composeTokens) {
        yield { choices: [{ delta: { content: token } }] };
      }
    },
  };

  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation((params: { stream?: boolean }) => {
          if (params.stream) {
            return Promise.resolve(mockStream);
          }
          // Extract call (non-streaming, JSON mode)
          return Promise.resolve({
            choices: [{ message: { content: extractionJson } }],
          });
        }),
      },
    },
  };
}

/** Build a default session mock object for the lock + findUniqueOrThrow flow. */
function buildSessionMock(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    locale: 'id',
    phase: 'COLLECTING',
    turnCount: 3,
    dimensiTerisi: {
      intensitas: { keywords: ['gatal parah'], negasi: [] },
    },
    dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    hasilDitampilkan: false,
    partial: false,
    perception: null,
    // Scoring V2 fields
    chipsAnswered: [],
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
    gatalMalam: false,
    kontakSerupa: false,
    lokasiKhas: false,
    asrama: false,
    tukarAlat: false,
    lastChipsTurn: 0,
    conflictDimension: null,
    conflictClarified: false,
    stagnationCount: 0,
    perceptionStartTurn: null,
    // Null means the perception phase has not asked anything yet, so a reply is
    // not treated as an answer to either of its two questions.
    perceptionStep: null,
    ...overrides,
  };
}

/** Set up mocks for the happy path (lock succeeds, messages load, etc.) */
function setupHappyPathMocks(sessionOverrides: Record<string, unknown> = {}) {
  const session = buildSessionMock(sessionOverrides);

  // Lock acquisition — succeeds
  mockUpdateMany.mockResolvedValue({ count: 1 } as never);

  // Load session after lock
  mockFindUniqueOrThrow.mockResolvedValue(session as never);

  // Message save — no-op
  mockMessageCreate.mockResolvedValue({} as never);

  // Load recent messages
  mockMessageFindMany.mockResolvedValue([
    { role: 'user', content: 'Gatal-gatal sudah seminggu', createdAt: new Date() },
    { role: 'assistant', content: 'Saya mengerti. Di mana saja rasanya?', createdAt: new Date() },
  ] as never);

  // Session update — no-op
  mockSessionUpdate.mockResolvedValue({} as never);

  // TurnExtraction save — no-op
  mockTurnExtractionCreate.mockResolvedValue({} as never);

  // TurnLog — no-op (best effort)
  mockTurnLogCreate.mockResolvedValue({} as never);

  // UnmappedPhrase — no-op
  mockUnmappedUpsert.mockResolvedValue({} as never);

  // AuditLog — no-op
  mockAuditLogCreate.mockResolvedValue({} as never);

  // ScreeningResult — no prior result
  mockResultFindFirst.mockResolvedValue(null);
  mockResultFindUnique.mockResolvedValue(null as never);
  mockResultCreate.mockResolvedValue({} as never);

  // Session findUnique (used by conflict clarification path)
  mockSessionFindUnique.mockResolvedValue({ conflictDimension: null } as never);

  return session;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processChatTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Happy path full turn
  describe('happy path full turn', () => {
    it('runs extract, compose streams, saves messages, and emits correct SSE events', async () => {
      setupHappyPathMocks();

      const extractionJson = JSON.stringify({
        dimensi: {
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        koreksi: [],
        emosi: 'netral',
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Baik', ', terima kasih.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Sudah lebih dari 2 minggu',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Should have phase, extraction, token(s), and done events
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();

      const extractionEvent = events.find((e) => e.type === 'extraction');
      expect(extractionEvent).toBeDefined();

      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBeGreaterThan(0);

      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect((doneEvent!.data as { turnCount: number }).turnCount).toBe(4); // turnCount incremented

      // User message saved
      expect(mockMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: SESSION_ID, role: 'user' }),
        }),
      );

      // Bot message saved (second call)
      const botSaveCalls = mockMessageCreate.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call) => (call[0] as any).data.role === 'assistant',
      );
      expect(botSaveCalls.length).toBe(1);

      // TurnExtraction saved
      expect(mockTurnExtractionCreate).toHaveBeenCalled();

      // Session state updated with new coverage
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SESSION_ID },
          data: expect.objectContaining({
            turnCount: 4,
          }),
        }),
      );

      // Unlock — final update sets processing=false
      const unlockCalls = mockSessionUpdate.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call) => (call[0] as any).data?.processing === false,
      );
      expect(unlockCalls.length).toBeGreaterThan(0);
    });
  });

  // 2. Lock conflict 409
  describe('lock conflict 409', () => {
    it('throws SessionBusyError when lock acquisition fails', async () => {
      // Lock acquisition fails — count = 0
      mockUpdateMany.mockResolvedValue({ count: 0 } as never);

      await expect(
        processChatTurn({
          sessionId: SESSION_ID,
          message: 'hello',
          isVoice: false,
        }),
      ).rejects.toThrow(SessionBusyError);
    });
  });

  // 3. Extract fail fallback
  describe('extract fail fallback', () => {
    it('skips extraction on failure, compose still runs, audit logged', async () => {
      setupHappyPathMocks();

      // LLM client: extract returns invalid JSON, compose streams normally
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Ceritakan lebih lanjut.' } }] };
        },
      };

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation((params: { stream?: boolean }) => {
              if (params.stream) {
                return Promise.resolve(mockStream);
              }
              // Extract call fails (invalid JSON)
              return Promise.resolve({
                choices: [{ message: { content: 'not valid json at all' } }],
              });
            }),
          },
        },
      };
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'test',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Compose tokens still arrive
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBeGreaterThan(0);

      // AuditLog for llm_extract_failed
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'llm_extract_failed',
          }),
        }),
      );

      // TurnExtraction NOT saved (extraction failed)
      expect(mockTurnExtractionCreate).not.toHaveBeenCalled();
    });
  });

  // 4. Compose fail fallback
  describe('compose fail fallback', () => {
    it('uses static template based on dimensiBelum[0] when compose fails', async () => {
      setupHappyPathMocks();

      const extractionJson = JSON.stringify({
        dimensi: {
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        koreksi: [],
        emosi: null,
        unmapped: [],
      });

      // LLM client: extract succeeds, compose throws
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation((params: { response_format?: unknown }) => {
              if (params.response_format) {
                // Extraction call — succeeds
                return Promise.resolve({
                  choices: [{ message: { content: extractionJson } }],
                });
              }
              // Compose call (streaming or non-streaming) — fails
              return Promise.reject(new Error('LLM compose timeout'));
            }),
          },
        },
      };
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'sudah 2 minggu lebih',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Should emit a token event with fallback template text
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBe(1);

      // Fallback template based on first remaining dimension after 'waktu' is filled
      // dimensiBelum was ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko']
      // After extraction covers 'waktu', first remaining is 'lokasi_tubuh'
      const tokenText = tokenEvents[0].data as string;
      expect(tokenText).toContain('tubuh');

      // AuditLog for llm_compose_failed
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'llm_compose_failed',
          }),
        }),
      );
    });
  });

  // 5. Quick-reply bypass
  describe('quick-reply bypass', () => {
    it('skips extraction when quickReplyToken is present, transitions phase directly', async () => {
      setupHappyPathMocks({
        phase: 'OFFERING_RESULT',
        dimensiBelum: [],
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
          lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
          lesi: { keywords: ['terowongan'], negasi: [] },
          faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
        },
        perception: 'adequate',
        hasilDitampilkan: true,
      });

      const mockClient = createMockLLMClient('{}', ['Terima kasih.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Lihat Hasil',
        quickReplyToken: 'lihat_hasil',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // LLM extract should NOT have been called in JSON mode
      const clientCalls = mockClient.chat.completions.create.mock.calls;
      const extractCalls = clientCalls.filter((call) => !(call[0] as { stream?: boolean }).stream);
      expect(extractCalls.length).toBe(0);

      // Phase event should be emitted
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();

      // Done event still present
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
    });
  });

  // 6. Crisis override
  describe('crisis override', () => {
    it('detects crisis, closes session immediately, emits CLOSED phase', async () => {
      setupHappyPathMocks();
      mockTransaction.mockImplementation(async (ops) => {
        if (Array.isArray(ops)) return ops.map(() => ({}));
        return {};
      });

      const mockClient = createMockLLMClient('{}');
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Saya ingin bunuh diri',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Phase should be CLOSED
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent!.data).toBe('CLOSED');

      // Should include an escalation token
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBeGreaterThan(0);
      const responseText = tokenEvents.map((e) => e.data as string).join('');
      expect(responseText).toContain('ustadz');

      // Transaction called to save crisis state
      expect(mockTransaction).toHaveBeenCalled();

      // AuditLog for crisis_detected
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'crisis_detected',
          }),
        }),
      );

      // LLM should NOT have been called (crisis bypasses extraction/compose)
      expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
    });
  });

  // 7. Turn budget force close
  describe('turn budget force close', () => {
    it('forces CLOSED phase when turnCount reaches 35', async () => {
      setupHappyPathMocks({
        turnCount: 34, // will become 35 after increment
        dimensiBelum: ['lesi', 'faktor_risiko'],
      });

      const extractionJson = JSON.stringify({
        dimensi: {},
        koreksi: [],
        emosi: null,
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Terima kasih.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'entahlah',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Phase should transition to CLOSED via hard limit
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent!.data).toBe('CLOSED');

      // Session should be updated to COMPLETED with CLOSED phase
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phase: 'CLOSED',
            status: 'COMPLETED',
          }),
        }),
      );
    });
  });

  // 8. Correction applies without rescore (revision system removed)
  describe('correction without rescore', () => {
    it('applies correction, updates coverage, but does not create new ScreeningResult', async () => {
      setupHappyPathMocks({
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah', 'gatal malam hari'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      });

      const extractionJson = JSON.stringify({
        dimensi: {},
        koreksi: [
          {
            dimensi: 'intensitas',
            keyword_dibatalkan: 'gatal malam hari',
            keyword_pengganti: null,
          },
        ],
        emosi: null,
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Baik, saya catat koreksinya.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Ternyata gatal malamnya bukan dari ini',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Stream completes successfully
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();

      // No rescore — no new ScreeningResult created mid-session
      expect(mockResultCreate).not.toHaveBeenCalled();

      // No rescore audit log
      const rescoreAudit = mockAuditLogCreate.mock.calls.find(
        (call) => (call[0] as { data: { event: string } }).data.event === 'rescore',
      );
      expect(rescoreAudit).toBeUndefined();
    });
  });

  // 9. Chips trigger flow — emits chips_request when kontak dimension touched
  describe('chips trigger flow', () => {
    it('emits chips_request SSE event when extraction touches kontak dimension', async () => {
      setupHappyPathMocks({
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
        },
        dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        chipsAnswered: [],
        chipsSubState: 'FREE_TEXT',
      });

      // Extraction touches 'kontak' dimension — should trigger kontak chips
      const extractionJson = JSON.stringify({
        dimensi: {
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
        },
        gatalMalam: null,
        koreksi: [],
        emosi: null,
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Bot reply.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Teman sekamar juga gatal',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Should emit a chips_request event
      const chipsEvent = events.find((e) => e.type === 'chips_request');
      expect(chipsEvent).toBeDefined();
      expect((chipsEvent!.data as { type: string }).type).toBe('single');

      // Should emit exactly 1 token (intro text before chips)
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBe(1);

      // Session should be updated to CHIPS_ACTIVE
      const updateCalls = mockSessionUpdate.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call) => ((call[0] as any).data?.chipsSubState as string)?.startsWith('CHIPS_ACTIVE'),
      );
      expect(updateCalls.length).toBeGreaterThan(0);

      // LLM compose should NOT have been called (chips short-circuits compose)
      const clientCalls = mockClient.chat.completions.create.mock.calls;
      const streamCalls = clientCalls.filter((call) => (call[0] as { stream?: boolean }).stream);
      expect(streamCalls.length).toBe(0);
    });
  });

  // 10. Chips answer processing — kontak Ya → updates kontakSerupa
  describe('chips answer processing', () => {
    it('processes kontak chips answer and updates scoring state', async () => {
      setupHappyPathMocks({
        chipsAnswered: [],
        chipsSubState: 'CHIPS_ACTIVE:kontak',
        gatalMalam: true,
        kontakSerupa: false,
      });

      const mockClient = createMockLLMClient('{}', ['Sip, lanjut ya.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Ya',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Should emit scoring event with updated kontakSerupa
      const scoringEvent = events.find((e) => e.type === 'scoring');
      expect(scoringEvent).toBeDefined();
      expect((scoringEvent!.data as { state: { kontakSerupa: boolean } }).state.kontakSerupa).toBe(
        true,
      );

      // Session update should include kontakSerupa = true
      const scoringUpdateCalls = mockSessionUpdate.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call) => (call[0] as any).data?.kontakSerupa === true,
      );
      expect(scoringUpdateCalls.length).toBeGreaterThan(0);
    });
  });

  // 11. Progressive scoring — emits scoring SSE event every turn
  describe('progressive scoring', () => {
    it('emits scoring SSE event with current state after extraction', async () => {
      setupHappyPathMocks({
        gatalMalam: true,
        kontakSerupa: false,
        lokasiKhas: false,
        asrama: false,
        tukarAlat: false,
      });

      const extractionJson = JSON.stringify({
        dimensi: {
          waktu: { keywords: ['lebih seminggu'], negasi: [] },
        },
        gatalMalam: true,
        koreksi: [],
        emosi: null,
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Oke.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Tiap malam makin parah',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Should emit a scoring event
      const scoringEvent = events.find((e) => e.type === 'scoring');
      expect(scoringEvent).toBeDefined();

      const scoringData = scoringEvent!.data as {
        state: { gatalMalam: boolean };
        riskLevel: string;
      };
      expect(scoringData.state.gatalMalam).toBe(true);
      expect(scoringData.riskLevel).toBe('LOW'); // 1 gejala, 0 faktor = LOW
    });
  });

  // 12. Conflict detection — logs conflict when LLM extraction vs chips disagree
  describe('conflict detection', () => {
    it('logs conflict when extraction and chips answer disagree', async () => {
      // Session: kontak was extracted (dimension exists with keywords) and chips is now active
      setupHappyPathMocks({
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
        },
        dimensiBelum: ['waktu', 'lokasi_tubuh', 'lesi', 'faktor_risiko'],
        chipsAnswered: [],
        chipsSubState: 'CHIPS_ACTIVE:kontak',
      });

      const mockClient = createMockLLMClient('{}', ['Oke noted.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      // User selects "Tidak" for kontak chips — conflicts with extraction (keywords detected)
      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Tidak',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Stream completes
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();

      // Conflict should be logged to audit
      const conflictAudit = mockAuditLogCreate.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call) => (call[0] as any).data?.event === 'conflict_detected',
      );
      expect(conflictAudit).toBeDefined();
    });
  });

  // 13. Tone theme injection — toneTheme from session is used in compose
  describe('tone theme injection', () => {
    it('passes tone theme from session to compose flow', async () => {
      setupHappyPathMocks({
        toneTheme: 'playful',
      });

      const extractionJson = JSON.stringify({
        dimensi: {
          waktu: { keywords: ['lebih seminggu'], negasi: [] },
        },
        koreksi: [],
        emosi: null,
        unmapped: [],
      });

      const mockClient = createMockLLMClient(extractionJson, ['Keren! ', 'Lanjut ya! 🎉']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const stream = await processChatTurn({
        sessionId: SESSION_ID,
        message: 'Sudah seminggu lebih',
        isVoice: false,
      });

      const raw = await consumeStream(stream);
      const events = parseSSEEvents(raw);

      // Compose was called
      const clientCalls = mockClient.chat.completions.create.mock.calls;
      const composeCalls = clientCalls.filter(
        (call) => !(call[0] as { response_format?: unknown }).response_format,
      );
      expect(composeCalls.length).toBe(1);

      // Token events should contain compose output
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBeGreaterThan(0);

      // Done event present — pipeline completed successfully
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
    });
  });
});

// 12. Continuation response after image upload
describe('continuation response handling', () => {
  it('asks perception severity when user confirms continuation with "siap"', async () => {
    // Simulates user responding "siap" after seeing "Siap lanjut?" from image upload
    setupHappyPathMocks({
      phase: 'ASKING_PERCEPTION',
      dimensiBelum: [],
      dimensiTerisi: {
        intensitas: { keywords: ['gatal parah'], negasi: [] },
        waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
        kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
        lesi: { keywords: ['ada lesi'], negasi: [] },
        faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
      },
      perception: null,
    });

    // Mock LLM for perception severity compose
    const mockClient = createMockLLMClient('{}', [
      'Nah menurut kamu, keluhan gatal ini termasuk...',
    ]);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'siap',
      isVoice: false,
    });

    const raw = await consumeStream(stream);
    const events = parseSSEEvents(raw);

    // Should emit token event with perception severity question
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);

    // Done event still present
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });

  it('asks perception severity when user confirms with "lanjut"', async () => {
    setupHappyPathMocks({
      phase: 'ASKING_PERCEPTION',
      dimensiBelum: [],
      dimensiTerisi: {
        intensitas: { keywords: ['gatal'], negasi: [] },
        waktu: { keywords: ['seminggu'], negasi: [] },
        lokasi_tubuh: { keywords: ['tangan'], negasi: [] },
        kontak: { keywords: ['tidak ada'], negasi: [] },
        lesi: { keywords: ['bintik'], negasi: [] },
        faktor_risiko: { keywords: ['asrama'], negasi: [] },
      },
      perception: null,
    });

    const mockClient = createMockLLMClient('{}', ['Oke, menurut kamu...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'lanjut',
      isVoice: false,
    });

    const raw = await consumeStream(stream);
    const events = parseSSEEvents(raw);

    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);
  });

  it('asks perception severity when user confirms with English "ready"', async () => {
    setupHappyPathMocks({
      locale: 'en',
      phase: 'ASKING_PERCEPTION',
      dimensiBelum: [],
      dimensiTerisi: {
        intensitas: { keywords: ['itchy'], negasi: [] },
        waktu: { keywords: ['week'], negasi: [] },
        lokasi_tubuh: { keywords: ['hands'], negasi: [] },
        kontak: { keywords: ['none'], negasi: [] },
        lesi: { keywords: ['bumps'], negasi: [] },
        faktor_risiko: { keywords: ['dorm'], negasi: [] },
      },
      perception: null,
    });

    const mockClient = createMockLLMClient('{}', ['So, how would you describe...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'ready',
      isVoice: false,
    });

    const raw = await consumeStream(stream);
    const events = parseSSEEvents(raw);

    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);
  });
});

// 13. Perception step bookkeeping
//
// The perception phase asks two questions in sequence, and every one of these
// tests is about the same thing: an answer belongs to the question that was
// actually asked. Losing track of that produced a phase that never ended —
// the severity question was re-composed on every turn, worded slightly
// differently each time, until the hard turn limit force-closed the session.
describe('perception step bookkeeping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A session that has arrived in the perception phase with everything collected. */
  function arrangePerceptionTurn(overrides: Record<string, unknown> = {}) {
    return setupHappyPathMocks({
      phase: 'ASKING_PERCEPTION',
      dimensiBelum: [],
      dimensiTerisi: {
        intensitas: { keywords: ['gatal parah'], negasi: [] },
        waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
        kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
        lesi: { keywords: ['ada lesi'], negasi: [] },
        faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
      },
      chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
      perception: null,
      ...overrides,
    });
  }

  /** Every `perception` value written to the session this turn. */
  function writtenPerceptions(): unknown[] {
    return (
      mockSessionUpdate.mock.calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((call) => (call[0] as any).data?.perception)
        .filter((value) => value !== undefined)
    );
  }

  /** Every `perceptionStep` value written to the session this turn. */
  function writtenSteps(): unknown[] {
    return (
      mockSessionUpdate.mock.calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((call) => (call[0] as any).data?.perceptionStep)
        .filter((value) => value !== undefined)
    );
  }

  it('does not read a reply to "Siap lanjut?" as a perception answer', async () => {
    // The failed-photo copy ends by asking "Siap lanjut?", so "siap" answers that
    // question and nothing else. Read as a perception answer it looked like a
    // denial — "no barrier" — and resolved perception to ADEQUATE before the
    // santri had been asked anything.
    arrangePerceptionTurn({ perceptionStep: null });

    const mockClient = createMockLLMClient('{}', ['Nah menurut kamu, keluhan ini...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'siap',
      isVoice: false,
    });
    await consumeStream(stream);

    expect(writtenPerceptions()).toEqual([]);
    expect(writtenSteps()).toEqual(['ASK_SEVERITY']);
  });

  it('records the severity question as asked, so the next turn can answer it', async () => {
    arrangePerceptionTurn({ perceptionStep: null, turnCount: 9 });

    const mockClient = createMockLLMClient('{}', ['Menurut kamu...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'siap',
      isVoice: false,
    });
    await consumeStream(stream);

    // Stamped when the question is asked rather than when the phase is entered:
    // an upload can enter the phase without asking anything.
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { perceptionStep: 'ASK_SEVERITY', perceptionStartTurn: 10 },
    });
  });

  it('follows a severity answer with the barrier question, not the severity question again', async () => {
    arrangePerceptionTurn({ perceptionStep: 'ASK_SEVERITY' });

    const mockClient = createMockLLMClient('{}', ['Oke noted, terus ada ga yang bikin ragu?']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: '1',
      isVoice: false,
    });
    await consumeStream(stream);

    // "1" is a severity, so perception is not resolved yet — the barrier question
    // still has to be asked.
    expect(writtenPerceptions()).toEqual([]);
    expect(writtenSteps()).toEqual(['ASK_BARRIER']);
  });

  it('treats "biasa" as a severity rather than a denial', async () => {
    arrangePerceptionTurn({ perceptionStep: 'ASK_SEVERITY' });

    const mockClient = createMockLLMClient('{}', ['Oke noted...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'biasa',
      isVoice: false,
    });
    await consumeStream(stream);

    expect(writtenPerceptions()).toEqual([]);
    expect(writtenSteps()).toEqual(['ASK_BARRIER']);
  });

  it('resolves perception to ADEQUATE when the barrier question is denied', async () => {
    arrangePerceptionTurn({ perceptionStep: 'ASK_BARRIER' });

    const mockClient = createMockLLMClient('{}', ['Sip!']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'ga ada',
      isVoice: false,
    });
    await consumeStream(stream);

    expect(writtenPerceptions()).toEqual(['ADEQUATE']);
  });

  it('resolves perception to BARRIER when a barrier is named', async () => {
    arrangePerceptionTurn({ perceptionStep: 'ASK_BARRIER' });

    const mockClient = createMockLLMClient('{}', ['Gapapa...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'malu sih',
      isVoice: false,
    });
    await consumeStream(stream);

    expect(writtenPerceptions()).toEqual(['BARRIER']);
  });

  it('still records a volunteered barrier on the severity turn', async () => {
    // Naming a barrier unprompted is real signal, not an ambiguous shape, so it
    // counts whichever question was on the table.
    arrangePerceptionTurn({ perceptionStep: 'ASK_SEVERITY' });

    const mockClient = createMockLLMClient('{}', ['Gapapa...']);
    mockGetPrimaryClient.mockReturnValue(mockClient as never);

    const stream = await processChatTurn({
      sessionId: SESSION_ID,
      message: 'takut diketawain',
      isVoice: false,
    });
    await consumeStream(stream);

    expect(writtenPerceptions()).toEqual(['BARRIER']);
  });
});
