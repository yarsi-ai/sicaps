import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let mockScreeningChatVersion = 'v2';

vi.mock('@/features/screening-chat-v1', () => ({
  verifySessionAccess: vi.fn(),
  getResult: vi.fn(),
}));

vi.mock('@/features/screening-chat-v2', () => ({
  getResult: vi.fn(),
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    get SCREENING_CHAT_VERSION() {
      return mockScreeningChatVersion;
    },
  };
});

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

import { GET } from './route';
import { verifySessionAccess, getResult } from '@/features/screening-chat-v1';
import { getResult as getResultV2 } from '@/features/screening-chat-v2';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/api/ip';
import { InvalidTokenError, SessionNotFoundError } from '@/lib/errors';

const mockVerifySessionAccess = vi.mocked(verifySessionAccess);
const mockGetResult = vi.mocked(getResult);
const mockGetResultV2 = vi.mocked(getResultV2);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetClientIp = vi.mocked(getClientIp);

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TOKEN = '660e8400-e29b-41d4-a716-446655440001';

function makeRequest(sessionId: string, token?: string): NextRequest {
  const url = token
    ? `http://localhost:3000/api/screening/result/${sessionId}?token=${token}`
    : `http://localhost:3000/api/screening/result/${sessionId}`;
  return new NextRequest(url, { method: 'GET' });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const mockResultData = {
  sessionId: VALID_SESSION_ID,
  completedAt: '2025-01-01T12:00:00.000Z',
  demographics: { name: 'Test', age: 15, gender: 'male', educationLevel: 'junior_high' },
  totalScore: 5,
  riskLevel: 'MODERATE' as const,
  scores: { intensitas: 1, waktu: 1, lokasi_tubuh: 1, kontak: 1, lesi: 1, faktor_risiko: 0 },
  conclusion: 'Risiko sedang.',
  perceptionResponse: null,
  recommendation: 'Konsultasi dokter.',
  personalizedSuggestion: null,
};

describe('GET /api/screening/result/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScreeningChatVersion = 'v1';
    mockGetClientIp.mockReturnValue('192.168.1.1');
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 29,
      limit: 30,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    mockVerifySessionAccess.mockResolvedValue({ id: VALID_SESSION_ID, locale: 'id' });
    mockGetResult.mockResolvedValue(mockResultData);
  });

  it('returns 200 with result data for completed session and valid token', async () => {
    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockResultData);
    expect(body.error).toBeNull();
    expect(body.meta).toBeDefined();
  });

  it('calls verifySessionAccess with requireCompleted option', async () => {
    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    await GET(request, makeParams(VALID_SESSION_ID));

    expect(mockVerifySessionAccess).toHaveBeenCalledWith(VALID_SESSION_ID, VALID_TOKEN, {
      requireCompleted: true,
    });
  });

  it('returns 404 SESSION_NOT_FOUND when session does not exist', async () => {
    mockVerifySessionAccess.mockRejectedValue(new SessionNotFoundError());

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 404 SESSION_NOT_FOUND when session is not completed', async () => {
    mockVerifySessionAccess.mockRejectedValue(new SessionNotFoundError());

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 403 INVALID_TOKEN when token does not match', async () => {
    mockVerifySessionAccess.mockRejectedValue(new InvalidTokenError());

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 429 RATE_LIMITED when rate limit exceeded', async () => {
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      limit: 30,
      resetAt: Math.floor(Date.now() / 1000) + 45,
      retryAfterSeconds: 45,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 45),
    });

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(response.headers.get('Retry-After')).toBe('45');
  });
});

describe('GET /api/screening/result/:id (V2)', () => {
  const mockV2Result = {
    riskLevel: 'HIGH' as const,
    gejalaCount: 4,
    faktorCount: 2,
    scoringState: { gatal_malam: true, lesi: true, kontak: true, lokasi: true },
    perception: 'Saya merasa gatal sekali',
    partial: false,
    edukasi: ['Segera temui kader santri atau dokter untuk pemeriksaan'],
    aiConclusion: 'Berdasarkan gejala yang Anda alami, risiko skabies tergolong tinggi.',
    aiPerceptionResponse: 'Kami memahami ketidaknyamanan yang Anda rasakan.',
    aiRecommendation:
      'Segera konsultasi ke dokter\nJangan berbagi handuk\nCuci sprei seminggu sekali',
    aiSuggestion: 'Hindari menggaruk area yang gatal dan jaga kebersihan kulit.',
    visualResult: null,
    finalOutput: null,
    visualPredictionFailed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockScreeningChatVersion = 'v2';
    mockGetClientIp.mockReturnValue('192.168.1.1');
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 29,
      limit: 30,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    mockGetResultV2.mockResolvedValue(mockV2Result);
  });

  it('returns ResultResponse with AI fields for valid sessionId', async () => {
    const request = makeRequest(VALID_SESSION_ID);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockV2Result);
    expect(body.data.aiConclusion).toBe(mockV2Result.aiConclusion);
    expect(body.data.aiPerceptionResponse).toBe(mockV2Result.aiPerceptionResponse);
    expect(body.data.aiRecommendation).toBe(mockV2Result.aiRecommendation);
    expect(body.data.aiSuggestion).toBe(mockV2Result.aiSuggestion);
  });

  it('returns 400 VALIDATION_ERROR for invalid UUID', async () => {
    const request = makeRequest('not-a-uuid');
    const response = await GET(request, makeParams('not-a-uuid'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid session ID');
  });

  it('returns 404 NOT_FOUND when result does not exist', async () => {
    mockGetResultV2.mockResolvedValue(null);

    const request = makeRequest(VALID_SESSION_ID);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Result not found');
  });

  it('returns response matching API envelope format', async () => {
    const request = makeRequest(VALID_SESSION_ID);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    // Verify envelope structure
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('timestamp');
    expect(body.meta).toHaveProperty('requestId');

    // Success envelope: data present, error null
    expect(body.data).not.toBeNull();
    expect(body.error).toBeNull();

    // meta.timestamp is ISO date
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);

    // meta.requestId is a UUID
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
