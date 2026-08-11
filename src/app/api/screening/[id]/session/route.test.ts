import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/features/screening-chat-v1', () => ({
  verifySessionAccess: vi.fn(),
  getSessionState: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

import { GET } from './route';
import { verifySessionAccess, getSessionState } from '@/features/screening-chat-v1';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/api/ip';
import { InvalidTokenError, SessionNotFoundError } from '@/lib/errors';

const mockVerifySessionAccess = vi.mocked(verifySessionAccess);
const mockGetSessionState = vi.mocked(getSessionState);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetClientIp = vi.mocked(getClientIp);

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TOKEN = '660e8400-e29b-41d4-a716-446655440001';

function makeRequest(sessionId: string, token?: string): NextRequest {
  const url = token
    ? `http://localhost:3000/api/screening/${sessionId}/session?token=${token}`
    : `http://localhost:3000/api/screening/${sessionId}/session`;
  return new NextRequest(url, { method: 'GET' });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const mockSessionState = {
  sessionId: VALID_SESSION_ID,
  status: 'in_progress' as const,
  mode: 'ai' as const,
  theme: 'hybrid' as const,
  locale: 'id' as const,
  messages: [{ role: 'bot' as const, content: 'Halo!', timestamp: '2025-01-01T00:00:00.000Z' }],
  categoriesCovered: ['intensitas'],
  currentPills: null,
};

describe('GET /api/screening/:id/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockGetSessionState.mockResolvedValue(mockSessionState);
  });

  it('returns 200 with session state on valid request', async () => {
    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockSessionState);
    expect(body.error).toBeNull();
    expect(body.meta).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it('calls verifySessionAccess with sessionId and token', async () => {
    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    await GET(request, makeParams(VALID_SESSION_ID));

    expect(mockVerifySessionAccess).toHaveBeenCalledWith(VALID_SESSION_ID, VALID_TOKEN);
  });

  it('returns 400 VALIDATION_ERROR when session ID is not a UUID', async () => {
    const request = makeRequest('not-a-uuid', VALID_TOKEN);
    const response = await GET(request, makeParams('not-a-uuid'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid session ID');
  });

  it('returns 403 INVALID_TOKEN when token is missing', async () => {
    mockVerifySessionAccess.mockRejectedValue(new InvalidTokenError());

    const request = makeRequest(VALID_SESSION_ID);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 403 INVALID_TOKEN when token is invalid', async () => {
    mockVerifySessionAccess.mockRejectedValue(new InvalidTokenError());

    const request = makeRequest(VALID_SESSION_ID, 'bad-token');
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 404 SESSION_NOT_FOUND when session does not exist', async () => {
    mockVerifySessionAccess.mockRejectedValue(new SessionNotFoundError());

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
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

  it('includes X-RateLimit-* headers on success', async () => {
    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));

    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('29');
  });

  it('returns 500 INTERNAL_ERROR on unexpected errors', async () => {
    mockVerifySessionAccess.mockRejectedValue(new Error('DB connection failed'));

    const request = makeRequest(VALID_SESSION_ID, VALID_TOKEN);
    const response = await GET(request, makeParams(VALID_SESSION_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
