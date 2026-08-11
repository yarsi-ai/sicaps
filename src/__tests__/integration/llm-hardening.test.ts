/**
 * Integration test: Full flow with mocked LLM and Prisma
 *
 * Simulates the complete happy-path flow:
 * 1. Create session → get sessionId
 * 2. Send chat message → verify SSE stream (tokens + done)
 * 3. Verify scoring → TurnLog + TurnExtraction exist
 * 4. Submit feedback → persist accuracy mark
 * 5. Export CSV → verify data includes the session
 *
 * Requirements: R1.1, R3.1, R3.2, R3.3, R3.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// Use a valid UUID for sessionId (required by chat schema validation)
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';

const mockSession = {
  id: SESSION_ID,
  source: 'testing',
  locale: 'id',
  status: 'IN_PROGRESS',
  mode: 'ai',
  perception: null,
  categoriesCovered: [],
  scores: null,
  totalScore: null,
  riskLevel: null,
  promptVersion: 'v1',
  scoringVersion: null,
  createdAt: new Date('2025-06-25T10:00:00Z'),
  updatedAt: new Date('2025-06-25T10:00:00Z'),
};

const mockDemographics = {
  id: 'demo-integ-001',
  sessionId: SESSION_ID,
  age: 16,
  gender: 'male',
  educationLevel: 'JUNIOR_HIGH',
  name: null,
  createdAt: new Date('2025-06-25T10:00:00Z'),
};

const mockTurnLog = {
  id: 'tl-integ-001',
  sessionId: SESSION_ID,
  turnNumber: 1,
  userMessage: 'saya gatal di tangan',
  rawResponse: JSON.stringify({
    reply: 'Baik, saya mengerti Anda mengalami gatal di tangan.',
    extraction: {
      intensitas: [{ keyword: 'gatal', confidence: 0.9 }],
      waktu: [],
      lokasi_tubuh: [{ keyword: 'tangan', confidence: 0.85 }],
      kontak: [],
      lesi: [],
      faktor_risiko: [],
    },
  }),
  parseStatus: 'SUCCESS',
  parseError: null,
  systemMessage: 'You are a scabies screening assistant.',
  model: 'llama-3.1-8b-instant',
  promptVersion: 'v1',
  latencyMs: 1200,
  tokenUsage: { input: 120, output: 60 },
  retryCount: 0,
  createdAt: new Date('2025-06-25T10:01:00Z'),
};

const mockExtraction = {
  id: 'ext-integ-001',
  sessionId: SESSION_ID,
  turnNumber: 1,
  extraction: {
    intensitas: [{ keyword: 'gatal', confidence: 0.9 }],
    waktu: [],
    lokasi_tubuh: [{ keyword: 'tangan', confidence: 0.85 }],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  },
  scores: {
    intensitas: { score: 3, matched: 1, status: 'assessed' },
    waktu: { score: 0, matched: 0, status: 'pending' },
    lokasi_tubuh: { score: 2, matched: 1, status: 'assessed' },
    kontak: { score: 0, matched: 0, status: 'pending' },
    lesi: { score: 0, matched: 0, status: 'pending' },
    faktor_risiko: { score: 0, matched: 0, status: 'pending' },
  },
  createdAt: new Date('2025-06-25T10:01:00Z'),
};

const mockFeedback = {
  id: 'fb-integ-001',
  sessionId: SESSION_ID,
  turnNumber: 1,
  evaluatorType: 'DEVELOPER',
  isAccurate: true,
  notes: 'Extraction looks correct',
  promptVersion: 'v1',
  createdAt: new Date('2025-06-25T10:02:00Z'),
  updatedAt: new Date('2025-06-25T10:02:00Z'),
};

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    turnLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    turnExtraction: {
      create: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    evaluationFeedback: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ─── Mock chat service for chat route ────────────────────────────────────────

vi.mock('@/features/screening-chat-v1', () => ({
  processChatTurn: vi.fn(),
  processQuestionnaireAnswer: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { prisma } from '@/db/prisma';
import { processChatTurn } from '@/features/screening-chat-v1';
import { checkRateLimit, safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';

import { POST as createSessionPOST } from '@/app/api/test/create-session/route';
import { POST as chatPOST } from '@/app/api/screening/chat/route';
import { GET as scoringGET } from '@/app/api/test/session/[id]/scoring/route';
import { POST as feedbackPOST } from '@/app/api/test/session/[id]/feedback/route';
import { GET as exportGET } from '@/app/api/test/evaluations/export/route';

// ─── Typed mocks ────────────────────────────────────────────────────────────

const mockCreateSession = vi.mocked(prisma.screeningSession.create);
const mockFindUniqueSession = vi.mocked(prisma.screeningSession.findUnique);
const _mockTurnLogCreate = vi.mocked(prisma.turnLog.create);
const mockTurnLogFindMany = vi.mocked(prisma.turnLog.findMany);
const _mockExtractionCreate = vi.mocked(prisma.turnExtraction.create);
const mockFeedbackUpsert = vi.mocked(prisma.evaluationFeedback.upsert);
const mockProcessChatTurn = vi.mocked(processChatTurn);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockSSEStream(
  events: Array<{ event: string; data: unknown }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        const text = `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`;
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });
}

async function readSSE(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

function parseSSEEvents(sseText: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = sseText.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event && data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        events.push({ event, data });
      }
    }
  }
  return events;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Integration: Full LLM Hardening Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default rate limit setup (allow all)
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetAt: 1700000060,
      retryAfterSeconds: null,
    });
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetAt: 1700000060,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '9',
      'X-RateLimit-Reset': '1700000060',
    });
  });

  it('completes full flow: create session → chat → scoring → feedback → export', async () => {
    // ─── Step 1: Create session ───────────────────────────────────────────

    mockCreateSession.mockResolvedValue({
      id: SESSION_ID,
      source: 'testing',
    } as never);

    const createReq = new NextRequest('http://localhost/api/test/create-session', {
      method: 'POST',
      body: JSON.stringify({
        age: 16,
        gender: 'male',
        educationLevel: 'JUNIOR_HIGH',
        locale: 'id',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const createRes = await createSessionPOST(createReq);
    const createJson = await createRes.json();

    expect(createRes.status).toBe(200);
    expect(createJson.data.sessionId).toBe(SESSION_ID);
    expect(createJson.data.source).toBe('testing');

    const sessionId = createJson.data.sessionId;

    // ─── Step 2: Send chat message (mocked LLM stream) ───────────────────

    const stream = createMockSSEStream([
      { event: 'token', data: { content: 'Baik, ' } },
      { event: 'token', data: { content: 'saya mengerti.' } },
      {
        event: 'done',
        data: {
          categoriesCovered: ['intensitas', 'lokasi_tubuh'],
          isComplete: false,
          mode: 'ai',
        },
      },
    ]);
    mockProcessChatTurn.mockResolvedValue(stream);

    // Chat route now loads session for validation before processing
    mockFindUniqueSession.mockResolvedValueOnce({
      ...mockSession,
      mode: 'ai',
      status: 'IN_PROGRESS',
      updatedAt: new Date(),
    } as never);

    const chatReq = new NextRequest('http://localhost/api/screening/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message: 'saya gatal di tangan', isVoice: false }),
      headers: { 'Content-Type': 'application/json' },
    });

    const chatRes = await chatPOST(chatReq);

    expect(chatRes.headers.get('Content-Type')).toBe('text/event-stream');

    const sseText = await readSSE(chatRes);
    const events = parseSSEEvents(sseText);

    // Verify stream contains tokens and done event
    const tokenEvents = events.filter((e) => e.event === 'token');
    const doneEvents = events.filter((e) => e.event === 'done');

    expect(tokenEvents).toHaveLength(2);
    expect((tokenEvents[0]!.data as { content: string }).content).toBe('Baik, ');
    expect((tokenEvents[1]!.data as { content: string }).content).toBe('saya mengerti.');
    expect(doneEvents).toHaveLength(1);

    const doneData = doneEvents[0]!.data as {
      categoriesCovered: string[];
      isComplete: boolean;
      mode: string;
    };
    expect(doneData.categoriesCovered).toContain('intensitas');
    expect(doneData.categoriesCovered).toContain('lokasi_tubuh');
    expect(doneData.isComplete).toBe(false);
    expect(doneData.mode).toBe('ai');

    // ─── Step 3: Verify scoring (TurnLog + TurnExtraction) ────────────────

    mockFindUniqueSession.mockResolvedValue({
      ...mockSession,
      totalScore: 5,
      riskLevel: 'LOW',
      categoriesCovered: ['intensitas', 'lokasi_tubuh'],
      demographics: mockDemographics,
      turnLogs: [mockTurnLog],
      extractions: [mockExtraction],
      evaluationFeedbacks: [],
    } as never);

    const scoringReq = new NextRequest(`http://localhost/api/test/session/${sessionId}/scoring`, {
      method: 'GET',
    });

    const scoringRes = await scoringGET(scoringReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const scoringJson = await scoringRes.json();

    expect(scoringRes.status).toBe(200);
    expect(scoringJson.data.session.id).toBe(sessionId);
    expect(scoringJson.data.session.source).toBe('testing');

    // Verify TurnLog exists for the turn
    expect(scoringJson.data.turns).toHaveLength(1);
    expect(scoringJson.data.turns[0].turnNumber).toBe(1);
    expect(scoringJson.data.turns[0].log.parseStatus).toBe('SUCCESS');
    expect(scoringJson.data.turns[0].log.userMessage).toBe('saya gatal di tangan');
    expect(scoringJson.data.turns[0].log.model).toBe('llama-3.1-8b-instant');

    // Verify TurnExtraction exists (R3.1, R3.2 — pool reconstruction reads only TurnExtraction)
    expect(scoringJson.data.turns[0].extraction).not.toBeNull();
    expect(scoringJson.data.turns[0].extraction.extraction.intensitas).toHaveLength(1);
    expect(scoringJson.data.turns[0].extraction.extraction.lokasi_tubuh).toHaveLength(1);

    // Verify all 6 category arrays present in extraction (R3.2)
    const extraction = scoringJson.data.turns[0].extraction.extraction;
    expect(extraction.intensitas).toBeDefined();
    expect(extraction.waktu).toBeDefined();
    expect(extraction.lokasi_tubuh).toBeDefined();
    expect(extraction.kontak).toBeDefined();
    expect(extraction.lesi).toBeDefined();
    expect(extraction.faktor_risiko).toBeDefined();

    // Verify scoring summary
    expect(scoringJson.data.scoring.totalScore).toBe(5);
    expect(scoringJson.data.scoring.riskLevel).toBe('LOW');
    expect(scoringJson.data.scoring.categoriesCovered).toContain('intensitas');
    expect(scoringJson.data.scoring.categoriesCovered).toContain('lokasi_tubuh');
    expect(scoringJson.data.scoring.categoriesRemaining).toContain('waktu');
    expect(scoringJson.data.scoring.categoriesRemaining).toContain('kontak');

    // ─── Step 4: Submit feedback ──────────────────────────────────────────

    mockFindUniqueSession.mockResolvedValue({
      id: sessionId,
      promptVersion: 'v1',
      source: 'testing',
    } as never);
    mockFeedbackUpsert.mockResolvedValue(mockFeedback as never);

    const feedbackReq = new NextRequest(`http://localhost/api/test/session/${sessionId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({
        turnNumber: 1,
        evaluatorType: 'DEVELOPER',
        isAccurate: true,
        notes: 'Extraction looks correct',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const feedbackRes = await feedbackPOST(feedbackReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    const feedbackJson = await feedbackRes.json();

    expect(feedbackRes.status).toBe(200);
    expect(feedbackJson.data.id).toBe('fb-integ-001');
    expect(feedbackJson.data.isAccurate).toBe(true);
    expect(feedbackJson.data.turnNumber).toBe(1);

    // Verify upsert was called with correct params
    expect(mockFeedbackUpsert).toHaveBeenCalledWith({
      where: {
        sessionId_turnNumber_evaluatorType: {
          sessionId,
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
        },
      },
      create: {
        sessionId,
        turnNumber: 1,
        evaluatorType: 'DEVELOPER',
        isAccurate: true,
        notes: 'Extraction looks correct',
        promptVersion: 'v1',
      },
      update: {
        isAccurate: true,
        notes: 'Extraction looks correct',
      },
    });

    // ─── Step 5: Export CSV ───────────────────────────────────────────────

    mockTurnLogFindMany.mockResolvedValue([
      {
        ...mockTurnLog,
        session: {
          source: 'testing',
          totalScore: 5,
          riskLevel: 'LOW',
          extractions: [mockExtraction],
          evaluationFeedbacks: [mockFeedback],
        },
      },
    ] as never);

    const exportReq = new NextRequest('http://localhost/api/test/evaluations/export', {
      method: 'GET',
    });

    const exportRes = await exportGET(exportReq);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(exportRes.headers.get('Content-Disposition')).toContain('attachment; filename=');

    const csv = await exportRes.text();
    const lines = csv.split('\n');

    // Header row present
    expect(lines[0]).toContain('sessionId');
    expect(lines[0]).toContain('turnNumber');
    expect(lines[0]).toContain('parseStatus');

    // Data row includes session data
    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain(sessionId);
    expect(lines[1]).toContain('SUCCESS');
    expect(lines[1]).toContain('saya gatal di tangan');
    expect(lines[1]).toContain('gatal'); // extracted keyword
    expect(lines[1]).toContain('true'); // feedback isAccurate

    // Verify export only queries source='testing' (R3.4 — source isolation)
    expect(mockTurnLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { source: 'testing' },
        }),
      }),
    );
  });

  it('verifies scoring returns correct remaining categories (R3.3, R3.4)', async () => {
    // Scoring with partial coverage — verify categoriesRemaining calculation
    mockFindUniqueSession.mockResolvedValue({
      ...mockSession,
      totalScore: 3,
      riskLevel: 'LOW',
      categoriesCovered: ['intensitas'],
      demographics: mockDemographics,
      turnLogs: [mockTurnLog],
      extractions: [
        {
          ...mockExtraction,
          extraction: {
            intensitas: [{ keyword: 'gatal', confidence: 0.9 }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          },
        },
      ],
      evaluationFeedbacks: [],
    } as never);

    const req = new NextRequest(`http://localhost/api/test/session/${mockSession.id}/scoring`, {
      method: 'GET',
    });

    const res = await scoringGET(req, { params: Promise.resolve({ id: mockSession.id }) });
    const json = await res.json();

    expect(json.data.scoring.categoriesCovered).toEqual(['intensitas']);
    expect(json.data.scoring.categoriesRemaining).toEqual([
      'waktu',
      'lokasi_tubuh',
      'kontak',
      'lesi',
      'faktor_risiko',
    ]);
  });

  it('verifies export filters to source=testing only (R3.4)', async () => {
    mockTurnLogFindMany.mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api/test/evaluations/export', {
      method: 'GET',
    });

    await exportGET(req);

    // Prisma query must filter by source='testing'
    expect(mockTurnLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: { source: 'testing' },
        }),
      }),
    );
  });

  it('handles turns without extraction in scoring (partial parse)', async () => {
    // Turn 2 has FAILURE parseStatus — no extraction should exist
    const failedTurnLog = {
      ...mockTurnLog,
      id: 'tl-integ-002',
      turnNumber: 2,
      userMessage: 'sudah lama',
      rawResponse: 'invalid json response',
      parseStatus: 'FAILURE',
      parseError: 'JSON parse error',
      latencyMs: 800,
      retryCount: 1,
    };

    mockFindUniqueSession.mockResolvedValue({
      ...mockSession,
      totalScore: 3,
      riskLevel: 'LOW',
      categoriesCovered: ['intensitas'],
      demographics: mockDemographics,
      turnLogs: [mockTurnLog, failedTurnLog],
      extractions: [mockExtraction], // Only turn 1 has extraction
      evaluationFeedbacks: [],
    } as never);

    const req = new NextRequest(`http://localhost/api/test/session/${mockSession.id}/scoring`, {
      method: 'GET',
    });

    const res = await scoringGET(req, { params: Promise.resolve({ id: mockSession.id }) });
    const json = await res.json();

    expect(json.data.turns).toHaveLength(2);

    // Turn 1: has extraction
    expect(json.data.turns[0].extraction).not.toBeNull();
    expect(json.data.turns[0].log.parseStatus).toBe('SUCCESS');

    // Turn 2: no extraction (R3.1 — pool reconstruction only from TurnExtraction)
    expect(json.data.turns[1].extraction).toBeNull();
    expect(json.data.turns[1].log.parseStatus).toBe('FAILURE');
    expect(json.data.turns[1].log.retryCount).toBe(1);
  });

  it('handles feedback upsert (update existing feedback)', async () => {
    // First create, then update — verify upsert behavior (R7.3)
    mockFindUniqueSession.mockResolvedValue({
      id: mockSession.id,
      promptVersion: 'v1',
      source: 'testing',
    } as never);

    // First feedback: accurate
    mockFeedbackUpsert.mockResolvedValue({
      id: 'fb-integ-001',
      isAccurate: true,
      turnNumber: 1,
    } as never);

    const firstReq = new NextRequest(
      `http://localhost/api/test/session/${mockSession.id}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
          isAccurate: true,
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const firstRes = await feedbackPOST(firstReq, {
      params: Promise.resolve({ id: mockSession.id }),
    });
    expect((await firstRes.json()).data.isAccurate).toBe(true);

    // Second feedback: inaccurate (upsert should update, not create duplicate)
    mockFeedbackUpsert.mockResolvedValue({
      id: 'fb-integ-001',
      isAccurate: false,
      turnNumber: 1,
    } as never);

    const secondReq = new NextRequest(
      `http://localhost/api/test/session/${mockSession.id}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
          isAccurate: false,
          notes: 'Actually incorrect extraction',
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const secondRes = await feedbackPOST(secondReq, {
      params: Promise.resolve({ id: mockSession.id }),
    });
    const secondJson = await secondRes.json();

    expect(secondJson.data.isAccurate).toBe(false);

    // Both calls should use same unique constraint key
    expect(mockFeedbackUpsert).toHaveBeenCalledTimes(2);
    expect(mockFeedbackUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          sessionId_turnNumber_evaluatorType: {
            sessionId: mockSession.id,
            turnNumber: 1,
            evaluatorType: 'DEVELOPER',
          },
        },
        update: {
          isAccurate: false,
          notes: 'Actually incorrect extraction',
        },
      }),
    );
  });
});
