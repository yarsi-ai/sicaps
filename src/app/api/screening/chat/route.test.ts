import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/prisma', () => ({
  prisma: { screeningSession: { findUnique: vi.fn() } },
}));

vi.mock('@/features/screening-chat-v1', () => ({
  processChatTurn: vi.fn(),
  processQuestionnaireAnswer: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

import { prisma } from '@/db/prisma';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { processChatTurn, processQuestionnaireAnswer } from '@/features/screening-chat-v1';

import { POST } from './route';

const mockFindUnique = vi.mocked(prisma.screeningSession.findUnique);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockProcessChatTurn = vi.mocked(processChatTurn);
const mockProcessQuestionnaireAnswer = vi.mocked(processQuestionnaireAnswer);

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

const VALID_AI_BODY = { sessionId: VALID_SESSION_ID, message: 'Saya gatal', isVoice: false };
const VALID_QUESTIONNAIRE_BODY = {
  sessionId: VALID_SESSION_ID,
  selectedPills: ['option1', 'option2'],
};

const DEFAULT_RATE_LIMIT_HEADERS: Record<string, string> = {
  'X-RateLimit-Limit': '10',
  'X-RateLimit-Remaining': '9',
  'X-RateLimit-Reset': '1700000060',
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/screening/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createMockSession(
  overrides: Partial<{ id: string; mode: string; status: string; updatedAt: Date }> = {},
) {
  return {
    id: VALID_SESSION_ID,
    mode: 'ai',
    status: 'IN_PROGRESS',
    updatedAt: new Date(),
    ...overrides,
  };
}

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

describe('POST /api/screening/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 9,
      limit: 10,
      resetAt: 1700000060,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue(DEFAULT_RATE_LIMIT_HEADERS);
    mockFindUnique.mockResolvedValue(createMockSession());
  });

  describe('happy path — AI mode', () => {
    it('returns SSE stream with correct headers', async () => {
      const stream = createMockSSEStream([
        { event: 'token', data: { content: 'Hello' } },
        { event: 'done', data: { categoriesCovered: [], isComplete: false, mode: 'ai' } },
      ]);
      mockProcessChatTurn.mockResolvedValue(stream);

      const response = await POST(createRequest(VALID_AI_BODY));

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('streams token and done events on success', async () => {
      const stream = createMockSSEStream([
        { event: 'token', data: { content: 'Halo, ' } },
        { event: 'token', data: { content: 'apa kabar?' } },
        {
          event: 'done',
          data: { categoriesCovered: ['intensitas'], isComplete: false, mode: 'ai' },
        },
      ]);
      mockProcessChatTurn.mockResolvedValue(stream);

      const response = await POST(createRequest(VALID_AI_BODY));
      const sseText = await readSSE(response);

      expect(sseText).toContain('event: token');
      expect(sseText).toContain('"content":"Halo, "');
      expect(sseText).toContain('"content":"apa kabar?"');
      expect(sseText).toContain('event: done');
      expect(sseText).toContain('"categoriesCovered":["intensitas"]');
    });
  });

  describe('happy path — questionnaire mode', () => {
    it('returns JSON response with success envelope', async () => {
      mockFindUnique.mockResolvedValue(createMockSession({ mode: 'questionnaire' }));
      const mockResult = { nextQuestion: 'How are you?', pills: ['good', 'bad'] };
      mockProcessQuestionnaireAnswer.mockResolvedValue(mockResult);

      const response = await POST(createRequest(VALID_QUESTIONNAIRE_BODY));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockResult);
      expect(json.error).toBeNull();
    });
  });

  describe('validation errors', () => {
    it('returns 400 VALIDATION_ERROR when neither schema matches', async () => {
      const body = { sessionId: 'not-a-uuid', foo: 'bar' };

      const response = await POST(createRequest(body));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.data).toBeNull();
    });

    it('returns 400 VALIDATION_ERROR for missing message and no selectedPills', async () => {
      const body = { sessionId: VALID_SESSION_ID };

      const response = await POST(createRequest(body));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 RATE_LIMITED with Retry-After header', async () => {
      mockSafeCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        limit: 10,
        resetAt: 1700000060,
        retryAfterSeconds: 42,
      });
      mockGetRateLimitHeaders.mockReturnValue({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1700000060',
      });

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error.code).toBe('RATE_LIMITED');
      expect(response.headers.get('Retry-After')).toBe('42');
    });
  });

  describe('session errors', () => {
    it('returns 404 SESSION_NOT_FOUND when session does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('SESSION_NOT_FOUND');
      expect(json.data).toBeNull();
    });

    it('returns 409 SESSION_COMPLETED when session status is COMPLETED', async () => {
      mockFindUnique.mockResolvedValue(createMockSession({ status: 'COMPLETED' }));

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe('SESSION_COMPLETED');
      expect(json.data).toBeNull();
    });

    it('returns 409 SESSION_EXPIRED when session idle > 24h', async () => {
      const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      mockFindUnique.mockResolvedValue(createMockSession({ updatedAt: expiredDate }));

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe('SESSION_EXPIRED');
      expect(json.data).toBeNull();
    });
  });

  describe('message validation', () => {
    it('returns 400 MESSAGE_EMPTY when message is whitespace-only after sanitization', async () => {
      const body = { sessionId: VALID_SESSION_ID, message: '   \t\n   ', isVoice: false };

      const response = await POST(createRequest(body));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('MESSAGE_EMPTY');
      expect(json.data).toBeNull();
    });

    it('returns 400 MESSAGE_TOO_LONG when message exceeds 2000 characters', async () => {
      const body = { sessionId: VALID_SESSION_ID, message: 'a'.repeat(2001), isVoice: false };

      const response = await POST(createRequest(body));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('MESSAGE_TOO_LONG');
      expect(json.data).toBeNull();
    });
  });

  describe('mode mismatch', () => {
    it('returns 400 VALIDATION_ERROR when AI session receives selectedPills', async () => {
      mockFindUnique.mockResolvedValue(createMockSession({ mode: 'ai' }));

      const response = await POST(createRequest(VALID_QUESTIONNAIRE_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when questionnaire session receives message', async () => {
      mockFindUnique.mockResolvedValue(createMockSession({ mode: 'questionnaire' }));

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limit headers', () => {
    it('includes rate limit headers on successful responses', async () => {
      const stream = createMockSSEStream([
        { event: 'done', data: { categoriesCovered: [], isComplete: false, mode: 'ai' } },
      ]);
      mockProcessChatTurn.mockResolvedValue(stream);

      const response = await POST(createRequest(VALID_AI_BODY));

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(response.headers.get('X-RateLimit-Reset')).toBe('1700000060');
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 INTERNAL_ERROR on unexpected error from service', async () => {
      mockProcessChatTurn.mockRejectedValue(new Error('something broke'));

      const response = await POST(createRequest(VALID_AI_BODY));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.code).toBe('INTERNAL_ERROR');
      expect(json.data).toBeNull();
    });
  });
});
