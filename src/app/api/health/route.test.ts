import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

vi.mock('@/services/llm.service', () => ({
  checkLLMHealth: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

import { getClientIp } from '@/lib/api/ip';
import { getRateLimitHeaders, safeCheckRateLimit } from '@/lib/rate-limiter';
import { checkLLMHealth } from '@/services/llm.service';

const mockCheckLLMHealth = vi.mocked(checkLLMHealth);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetClientIp = vi.mocked(getClientIp);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health', { method: 'GET' });
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
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
  });

  it('returns 200 with status ok and llmAvailable true when LLM is reachable', async () => {
    mockCheckLLMHealth.mockResolvedValue(true);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ status: 'ok', llmAvailable: true });
    expect(body.error).toBeNull();
    expect(body.meta).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 200 with llmAvailable false when LLM is unavailable', async () => {
    mockCheckLLMHealth.mockResolvedValue(false);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ status: 'ok', llmAvailable: false });
    expect(body.error).toBeNull();
  });

  it('returns valid API envelope structure', async () => {
    mockCheckLLMHealth.mockResolvedValue(true);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['data', 'error', 'meta']);
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns 200 with llmAvailable false when LLM config is missing (no network call)', async () => {
    mockCheckLLMHealth.mockResolvedValue(false);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ status: 'ok', llmAvailable: false });
    expect(body.error).toBeNull();
    expect(mockCheckLLMHealth).toHaveBeenCalledOnce();
  });

  it('returns 500 with error envelope when an unexpected error occurs', async () => {
    mockCheckLLMHealth.mockRejectedValue(new Error('simulated failure'));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.data).toBeNull();
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: null,
    });
    expect(body.meta).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 429 with rate limit headers when rate limited', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 45;
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      limit: 30,
      resetAt,
      retryAfterSeconds: 45,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetAt),
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.data).toBeNull();
    expect(body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      details: null,
    });
    expect(response.headers.get('Retry-After')).toBe('45');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(mockCheckLLMHealth).not.toHaveBeenCalled();
  });
});
