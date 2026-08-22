/**
 * Multi-turn integration tests for Screening Chat V2.
 *
 * Tests exercise the full pipeline (chat.service + screening.service) with
 * mocked Prisma and LLM at module level. Validates end-to-end behavior
 * across multiple turns including phase transitions, corrections, and session resume.
 *
 * Validates: Requirements 17.4
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    turnExtraction: { create: vi.fn() },
    turnLog: { create: vi.fn() },
    screeningResult: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    unmappedPhrase: { upsert: vi.fn() },
    checkpoint: { upsert: vi.fn() },
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
import { processChatTurn } from '../application/chat.service';
import { resumeSession } from '../application/screening.service';
import { clearAttempts } from '../domain/chat/dimension-limiter';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockUpdateMany = vi.mocked(prisma.screeningSession.updateMany);
const mockFindUniqueOrThrow = vi.mocked(prisma.screeningSession.findUniqueOrThrow);
const mockSessionUpdate = vi.mocked(prisma.screeningSession.update);
const mockSessionFindUnique = vi.mocked(prisma.screeningSession.findUnique);
const mockMessageCreate = vi.mocked(prisma.chatMessage.create);
const mockMessageFindMany = vi.mocked(prisma.chatMessage.findMany);
const mockTurnExtractionCreate = vi.mocked(prisma.turnExtraction.create);
const mockTurnLogCreate = vi.mocked(prisma.turnLog.create);
const mockResultFindFirst = vi.mocked(prisma.screeningResult.findFirst);
const mockResultFindUnique = vi.mocked(prisma.screeningResult.findUnique);
const mockResultCreate = vi.mocked(prisma.screeningResult.create);
const mockUnmappedUpsert = vi.mocked(prisma.unmappedPhrase.upsert);
const mockCheckpointUpsert = vi.mocked(prisma.checkpoint.upsert);
const mockAuditLogCreate = vi.mocked(prisma.auditLog.create);
const _mockTransaction = vi.mocked(prisma.$transaction);
const mockGetPrimaryClient = vi.mocked(getPrimaryClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'int-test-session-001';

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

/** Build a mock LLM extraction JSON for a given set of dimensions/keywords. */
function buildExtractionJson(
  dimensi: Record<string, { keywords: string[]; negasi?: string[] }>,
  opts?: {
    koreksi?: Array<{
      dimensi: string;
      keyword_dibatalkan: string;
      keyword_pengganti: string | null;
    }>;
    emosi?: string;
    unmapped?: string[];
  },
): string {
  return JSON.stringify({
    dimensi: Object.fromEntries(
      Object.entries(dimensi).map(([k, v]) => [
        k,
        { keywords: v.keywords, negasi: v.negasi ?? [] },
      ]),
    ),
    koreksi: opts?.koreksi ?? [],
    emosi: opts?.emosi ?? 'netral',
    unmapped: opts?.unmapped ?? [],
  });
}

/** Create a mock LLM client that returns different extraction per call. */
function createMultiTurnLLMClient(extractions: string[], composeReplies: string[]) {
  let extractCallIndex = 0;
  let composeCallIndex = 0;

  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation((params: { stream?: boolean }) => {
          if (params.stream) {
            const reply = composeReplies[composeCallIndex] ?? 'Terima kasih.';
            composeCallIndex++;
            const mockStream = {
              [Symbol.asyncIterator]: async function* () {
                yield { choices: [{ delta: { content: reply } }] };
              },
            };
            return Promise.resolve(mockStream);
          }
          // Extract call
          const extraction = extractions[extractCallIndex] ?? '{}';
          extractCallIndex++;
          return Promise.resolve({
            choices: [{ message: { content: extraction } }],
          });
        }),
      },
    },
  };
}

/** Set up standard Prisma mocks that make the pipeline work. */
function setupPrismaMocks(sessionState: {
  phase: string;
  turnCount: number;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  perception?: string | null;
  hasilDitampilkan?: boolean;
  partial?: boolean;
  chipsAnswered?: string[];
  chipsSubState?: string;
  toneTheme?: string;
  gatalMalam?: boolean;
  kontakSerupa?: boolean;
  lokasiKhas?: boolean;
  asrama?: boolean;
  tukarAlat?: boolean;
  /**
   * The session's photo row. Defaults to a resolved one so scenarios about
   * dimension collection and follow-up are not silently parked in
   * AWAITING_IMAGE — pass `null` to exercise the photo gate itself.
   */
  image?: { visualResult: string | null } | null;
}) {
  mockUpdateMany.mockResolvedValue({ count: 1 } as never);
  mockFindUniqueOrThrow.mockResolvedValue({
    id: SESSION_ID,
    locale: 'id',
    image: sessionState.image === undefined ? { visualResult: 'NEGATIVE' } : sessionState.image,
    phase: sessionState.phase,
    turnCount: sessionState.turnCount,
    dimensiTerisi: sessionState.dimensiTerisi,
    dimensiBelum: sessionState.dimensiBelum,
    hasilDitampilkan: sessionState.hasilDitampilkan ?? false,
    partial: sessionState.partial ?? false,
    perception: sessionState.perception ?? null,
    chipsAnswered: sessionState.chipsAnswered ?? [],
    chipsSubState: sessionState.chipsSubState ?? 'FREE_TEXT',
    toneTheme: sessionState.toneTheme ?? 'hybrid',
    gatalMalam: sessionState.gatalMalam ?? false,
    kontakSerupa: sessionState.kontakSerupa ?? false,
    lokasiKhas: sessionState.lokasiKhas ?? false,
    asrama: sessionState.asrama ?? false,
    tukarAlat: sessionState.tukarAlat ?? false,
    lastChipsTurn: 0,
    conflictDimension: null,
    conflictClarified: false,
    stagnationCount: 0,
  } as never);
  mockMessageCreate.mockResolvedValue({} as never);
  mockMessageFindMany.mockResolvedValue([] as never);
  mockSessionUpdate.mockResolvedValue({} as never);
  mockSessionFindUnique.mockResolvedValue({ conflictDimension: null } as never);
  mockTurnExtractionCreate.mockResolvedValue({} as never);
  mockTurnLogCreate.mockResolvedValue({} as never);
  mockUnmappedUpsert.mockResolvedValue({} as never);
  mockAuditLogCreate.mockResolvedValue({} as never);
  mockResultFindFirst.mockResolvedValue(null);
  mockResultFindUnique.mockResolvedValue(null as never);
  mockResultCreate.mockResolvedValue({} as never);
  mockCheckpointUpsert.mockResolvedValue({} as never);
}

/** Run a single turn and return parsed SSE events. */
async function runTurn(
  message: string,
  opts?: { quickReplyToken?: string },
): Promise<Array<{ type: string; data: unknown }>> {
  const stream = await processChatTurn({
    sessionId: SESSION_ID,
    message,
    quickReplyToken: opts?.quickReplyToken,
    isVoice: false,
  });
  const raw = await consumeStream(stream);
  return parseSSEEvents(raw);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Multi-turn screening scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAttempts(SESSION_ID);
  });

  // =========================================================================
  // 1. Happy path: 6 turns → all slots filled → correct phase transition
  // =========================================================================
  describe('happy path: 6 turns fill all dimensions', () => {
    it('transitions through COLLECTING → ASKING_PERCEPTION as dimensions fill', async () => {
      // Simulate final turn — last non-chips dimension (lesi) being filled
      // All chips-exclusive dimensions already answered via chips in earlier turns
      setupPrismaMocks({
        phase: 'COLLECTING',
        turnCount: 5,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
          lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
          faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
        },
        dimensiBelum: ['lesi'],
        perception: null,
        chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
        gatalMalam: true,
        kontakSerupa: true,
        lokasiKhas: true,
        asrama: true,
        tukarAlat: false,
      });

      const extraction = buildExtractionJson({
        lesi: { keywords: ['terowongan'] },
      });

      const mockClient = createMultiTurnLLMClient(
        [extraction],
        ['Terima kasih, semua info sudah lengkap.'],
      );
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('Ada garis tipis di kulit kayak terowongan');

      // Phase should transition to ASKING_PERCEPTION (all 6 filled, perception still null)
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent!.data).toBe('ASKING_PERCEPTION');

      // Extraction event shows all dimensions filled
      const extractionEvent = events.find((e) => e.type === 'extraction');
      expect(extractionEvent).toBeDefined();
      const extractionData = extractionEvent!.data as {
        dimensiTerisi: string[];
        dimensiBelum: string[];
      };
      expect(extractionData.dimensiBelum).toHaveLength(0);
      expect(extractionData.dimensiTerisi).toHaveLength(6);

      // Done event with correct turn count
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect((doneEvent!.data as { turnCount: number }).turnCount).toBe(6);

      // Session state persisted with empty dimensiBelum
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dimensiBelum: [],
            turnCount: 6,
          }),
        }),
      );
    });

    it('parks in AWAITING_IMAGE instead of ASKING_PERCEPTION while no photo exists', async () => {
      setupPrismaMocks({
        phase: 'COLLECTING',
        turnCount: 5,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
          lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
          faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
        },
        dimensiBelum: ['lesi'],
        perception: null,
        chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
        image: null,
      });

      const mockClient = createMultiTurnLLMClient(
        [buildExtractionJson({ lesi: { keywords: ['terowongan'] } })],
        ['Terima kasih, semua info sudah lengkap.'],
      );
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('Ada garis tipis di kulit kayak terowongan');

      expect(events.find((e) => e.type === 'phase')!.data).toBe('AWAITING_IMAGE');

      // The gate turn uses fixed copy: a generic compose would have the model
      // invent another clinical question while the turn waits on an upload.
      const tokens = events
        .filter((e) => e.type === 'token')
        .map((e) => e.data)
        .join('');
      expect(tokens).toContain('foto area kulit yang gatal');
    });
  });

  // =========================================================================
  // 2. Curhat panjang: 1 turn fills 4 slots (opportunistic extraction)
  // =========================================================================
  describe('curhat panjang: single turn fills 4 dimensions', () => {
    it('extracts multiple dimensions from a single verbose message', async () => {
      setupPrismaMocks({
        phase: 'COLLECTING',
        turnCount: 0,
        dimensiTerisi: {},
        dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      });

      // User provides a long narrative — extraction detects 4 dimensions
      // But chips-exclusive (lokasi_tubuh, kontak) are signal-only, not merged
      const extraction = buildExtractionJson({
        intensitas: { keywords: ['gatal parah'] },
        waktu: { keywords: ['lebih 2 minggu'] },
        lokasi_tubuh: { keywords: ['sela jari', 'pergelangan tangan'] },
        kontak: { keywords: ['teman sekamar gatal'] },
      });

      const mockClient = createMultiTurnLLMClient(
        [extraction],
        ['Terima kasih sudah bercerita. Apakah ada bintik atau luka di kulit?'],
      );
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn(
        'Sudah 2 minggu lebih gatal banget di sela jari dan pergelangan. Teman sekamar juga gatal.',
      );

      // Extraction event: only non-chips dimensions filled (intensitas, waktu)
      // lokasi_tubuh and kontak are signal-only, stay in dimensiBelum
      const extractionEvent = events.find((e) => e.type === 'extraction');
      expect(extractionEvent).toBeDefined();
      const extractionData = extractionEvent!.data as {
        dimensiTerisi: string[];
        dimensiBelum: string[];
      };
      expect(extractionData.dimensiTerisi).toContain('intensitas');
      expect(extractionData.dimensiTerisi).toContain('waktu');
      expect(extractionData.dimensiTerisi).not.toContain('lokasi_tubuh');
      expect(extractionData.dimensiTerisi).not.toContain('kontak');
      // chips-exclusive dimensions remain in dimensiBelum
      expect(extractionData.dimensiBelum).toContain('lokasi_tubuh');
      expect(extractionData.dimensiBelum).toContain('kontak');
      expect(extractionData.dimensiBelum).toContain('lesi');
      expect(extractionData.dimensiBelum).toContain('faktor_risiko');

      // Phase remains COLLECTING
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent!.data).toBe('COLLECTING');
    });
  });

  // =========================================================================
  // 3. Correction mid-session: no rescore (revision system removed)
  // =========================================================================
  describe('correction mid-session: no rescore', () => {
    it('applies correction and updates coverage without creating new ScreeningResult', async () => {
      setupPrismaMocks({
        phase: 'FOLLOW_UP',
        turnCount: 10,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah', 'gatal malam hari'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
          lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
          lesi: { keywords: ['terowongan'], negasi: [] },
          faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
        },
        dimensiBelum: [],
        perception: 'adequate',
        hasilDitampilkan: true,
        chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
        gatalMalam: true,
        kontakSerupa: true,
        lokasiKhas: true,
        asrama: true,
        tukarAlat: false,
      });

      // Extraction includes a correction
      const extraction = buildExtractionJson(
        {},
        {
          koreksi: [
            {
              dimensi: 'intensitas',
              keyword_dibatalkan: 'gatal malam hari',
              keyword_pengganti: null,
            },
          ],
        },
      );

      const mockClient = createMultiTurnLLMClient([extraction], ['Baik, saya catat koreksinya.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('Ternyata gatal malamnya bukan dari penyakit kulit ini');

      // Stream completes successfully
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();

      // No rescore — revision system removed
      expect(mockResultCreate).not.toHaveBeenCalled();

      // No rescore audit log
      const rescoreAudit = mockAuditLogCreate.mock.calls.find(
        (call) => (call[0] as { data: { event: string } }).data.event === 'rescore',
      );
      expect(rescoreAudit).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Follow-up with new symptom: coverage updated, no revision
  // =========================================================================
  describe('follow-up with new symptom: coverage updated', () => {
    it('extracts new keywords during follow-up phase without creating new result', async () => {
      setupPrismaMocks({
        phase: 'FOLLOW_UP',
        turnCount: 12,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal ringan'], negasi: [] },
          waktu: { keywords: ['kurang 1 minggu'], negasi: [] },
          lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
          kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
          lesi: { keywords: ['bentol merah'], negasi: [] },
          faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
        },
        dimensiBelum: [],
        perception: 'underestimate',
        hasilDitampilkan: true,
        chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
        gatalMalam: false,
        kontakSerupa: true,
        lokasiKhas: true,
        asrama: true,
        tukarAlat: false,
      });

      // User reports new, more severe symptom — extraction adds keyword to existing dimension
      const extraction = buildExtractionJson({
        intensitas: { keywords: ['gatal parah'] },
        lesi: { keywords: ['terowongan'] },
      });

      const mockClient = createMultiTurnLLMClient([extraction], ['Saya catat gejala barunya.']);
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('Sebenarnya gatalnya makin parah dan ada seperti terowongan');

      // Stream completes
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();

      // Phase stays FOLLOW_UP (all dimensions filled, perception set, hasilDitampilkan=true)
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent!.data).toBe('FOLLOW_UP');

      // No rescore — revision system removed
      expect(mockResultCreate).not.toHaveBeenCalled();

      // Session state updated with merged keywords
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            turnCount: 13,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 5. Partial abandon: hit turn budget → no score, directed to clinic
  // =========================================================================
  describe('partial abandon: turn budget exceeded', () => {
    it('forces CLOSED when turnCount reaches 35, emits CLOSED phase', async () => {
      setupPrismaMocks({
        phase: 'COLLECTING',
        turnCount: 34, // will become 35 after increment → hard limit
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      });

      const extraction = buildExtractionJson({});
      const mockClient = createMultiTurnLLMClient(
        [extraction],
        ['Terima kasih sudah berbagi. Silakan kunjungi klinik untuk pemeriksaan lebih lanjut.'],
      );
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('entahlah saya bingung');

      // Phase should be CLOSED (hard turn limit reached)
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent!.data).toBe('CLOSED');

      // Session updated with CLOSED + COMPLETED
      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phase: 'CLOSED',
            status: 'COMPLETED',
          }),
        }),
      );

      // AuditLog records phase transition
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'phase_transition',
            detail: expect.objectContaining({ to: 'CLOSED' }),
          }),
        }),
      );

      // No ScreeningResult created (partial — no score)
      expect(mockResultCreate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Resume session: state restored, continues from correct phase
  // =========================================================================
  describe('resume session: state restored', () => {
    it('returns session state when IN_PROGRESS and not expired', async () => {
      const futureExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now

      mockSessionFindUnique.mockResolvedValue({
        id: SESSION_ID,
        status: 'IN_PROGRESS',
        phase: 'COLLECTING',
        turnCount: 4,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        expiresAt: futureExpiry,
      } as never);

      const result = await resumeSession(SESSION_ID);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(SESSION_ID);
      expect(result!.phase).toBe('COLLECTING');
      expect(result!.turnCount).toBe(4);
      expect(result!.dimensiBelum).toHaveLength(4);
      expect(Object.keys(result!.dimensiTerisi)).toHaveLength(2);
    });

    it('returns null when session is expired', async () => {
      const pastExpiry = new Date(Date.now() - 60 * 60 * 1000); // 1h ago

      mockSessionFindUnique.mockResolvedValue({
        id: SESSION_ID,
        status: 'IN_PROGRESS',
        phase: 'COLLECTING',
        turnCount: 4,
        dimensiTerisi: {},
        dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        expiresAt: pastExpiry,
      } as never);

      const result = await resumeSession(SESSION_ID);

      expect(result).toBeNull();
    });

    it('returns null when session is COMPLETED', async () => {
      mockSessionFindUnique.mockResolvedValue({
        id: SESSION_ID,
        status: 'COMPLETED',
        phase: 'SCREENING_COMPLETE',
        turnCount: 10,
        dimensiTerisi: { intensitas: { keywords: ['gatal parah'], negasi: [] } },
        dimensiBelum: [],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      } as never);

      const result = await resumeSession(SESSION_ID);

      expect(result).toBeNull();
    });

    it('resumes and then processes the next turn correctly', async () => {
      const futureExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);

      // Step 1: Resume
      mockSessionFindUnique.mockResolvedValue({
        id: SESSION_ID,
        status: 'IN_PROGRESS',
        phase: 'COLLECTING',
        turnCount: 4,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
        expiresAt: futureExpiry,
      } as never);

      const resumeResult = await resumeSession(SESSION_ID);
      expect(resumeResult).not.toBeNull();
      expect(resumeResult!.phase).toBe('COLLECTING');

      // Step 2: Process next turn from resumed state
      setupPrismaMocks({
        phase: 'COLLECTING',
        turnCount: 4,
        dimensiTerisi: {
          intensitas: { keywords: ['gatal parah'], negasi: [] },
          waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        },
        dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      });

      // User mentions lokasi — extraction detects it as signal, triggers chips
      const extraction = buildExtractionJson({
        lokasi_tubuh: { keywords: ['sela jari'] },
      });

      const mockClient = createMultiTurnLLMClient(
        [extraction],
        ['Di sela jari ya. Apakah ada orang lain yang mengalami hal serupa?'],
      );
      mockGetPrimaryClient.mockReturnValue(mockClient as never);

      const events = await runTurn('Di sela jari tangan');

      // Phase remains COLLECTING (chips-exclusive dims not filled by extraction)
      const phaseEvent = events.find((e) => e.type === 'phase');
      expect(phaseEvent!.data).toBe('COLLECTING');

      // Extraction shows: lokasi_tubuh NOT filled (chips-exclusive, signal only)
      const extractionEvent = events.find((e) => e.type === 'extraction');
      const extractionData = extractionEvent!.data as {
        dimensiTerisi: string[];
        dimensiBelum: string[];
      };
      expect(extractionData.dimensiTerisi).not.toContain('lokasi_tubuh');
      expect(extractionData.dimensiBelum).toContain('lokasi_tubuh');
      expect(extractionData.dimensiBelum).toContain('kontak');
      expect(extractionData.dimensiBelum).toContain('lesi');
      expect(extractionData.dimensiBelum).toContain('faktor_risiko');

      // Chips should be triggered (lokasi signal detected)
      const chipsEvent = events.find((e) => e.type === 'chips_request');
      expect(chipsEvent).toBeDefined();
    });
  });
});
