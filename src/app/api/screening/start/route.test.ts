import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/features/screening-chat-v1', () => ({
  createSession: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

import { POST } from './route';
import { createSession } from '@/features/screening-chat-v1';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/api/ip';

const mockCreateSession = vi.mocked(createSession);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetClientIp = vi.mocked(getClientIp);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/screening/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  demographics: {
    name: 'Ahmad',
    age: 14,
    gender: 'male',
    educationLevel: 'junior_high',
  },
  locale: 'id',
};

const mockSessionResult = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  shareToken: '660e8400-e29b-41d4-a716-446655440001',
  theme: 'hybrid' as const,
  locale: 'id' as const,
  mode: 'ai' as const,
  openingMessage: 'Halo! Saya SICAPS.',
};

describe('POST /api/screening/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('192.168.1.1');
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 4,
      limit: 5,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '4',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    mockCreateSession.mockResolvedValue(mockSessionResult);
  });

  it('returns 201 with correct shape on valid demographics', async () => {
    const request = makeRequest(validBody);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toEqual(mockSessionResult);
    expect(body.error).toBeNull();
    expect(body.meta).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it('calls createSession with parsed input', async () => {
    const request = makeRequest(validBody);
    await POST(request);

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        demographics: expect.objectContaining({
          name: 'Ahmad',
          age: 14,
          gender: 'male',
          educationLevel: 'junior_high',
        }),
        locale: 'id',
      }),
    );
  });

  it('returns 400 VALIDATION_ERROR when demographics is missing', async () => {
    const request = makeRequest({ locale: 'id' });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid request body');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 400 VALIDATION_ERROR when age is out of range', async () => {
    const request = makeRequest({
      demographics: { age: 2, gender: 'male', educationLevel: 'elementary' },
      locale: 'id',
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: expect.stringContaining('age') })]),
    );
  });

  it('returns 429 RATE_LIMITED with Retry-After header when rate limited', async () => {
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      limit: 5,
      resetAt: Math.floor(Date.now() / 1000) + 45,
      retryAfterSeconds: 45,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 45),
    });

    const request = makeRequest(validBody);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toBe('Rate limit exceeded');
    expect(response.headers.get('Retry-After')).toBe('45');
  });

  it('includes X-RateLimit-* headers on success response', async () => {
    const request = makeRequest(validBody);
    const response = await POST(request);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('4');
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('sanitizes name field containing HTML', async () => {
    const bodyWithHtml = {
      demographics: {
        name: '<script>alert("xss")</script>Ahmad',
        age: 14,
        gender: 'male',
        educationLevel: 'junior_high',
      },
      locale: 'id',
    };

    const request = makeRequest(bodyWithHtml);
    await POST(request);

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        demographics: expect.objectContaining({
          name: expect.not.stringContaining('<script>'),
        }),
      }),
    );
  });

  it('returns valid API envelope structure', async () => {
    const request = makeRequest(validBody);
    const response = await POST(request);
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['data', 'error', 'meta']);
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
