import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/services/visual-detection.service', () => ({
  getImageGateStatus: vi.fn(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

import { GET } from './route';
import { getImageGateStatus } from '@/services/visual-detection.service';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/api/ip';
import { AppError } from '@/lib/errors';

const mockGetImageGateStatus = vi.mocked(getImageGateStatus);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockGetClientIp = vi.mocked(getClientIp);

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeRequest(sessionId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/screening/image/${sessionId}`, {
    method: 'GET',
  });
}

function makeParams(sessionId: string): { params: Promise<{ sessionId: string }> } {
  return { params: Promise.resolve({ sessionId }) };
}

describe('GET /api/screening/image/[sessionId]', () => {
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
  });

  // ---------------------------------------------------------------------------
  // Happy Paths
  // ---------------------------------------------------------------------------

  describe('happy paths', () => {
    it('returns 200 with resolved: false when no image exists', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });
      expect(body.error).toBeNull();
      expect(body.meta).toBeDefined();
      expect(body.meta.requestId).toBeDefined();
    });

    it('returns 200 with resolved: false when the image has no visual result yet', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });
      expect(body.error).toBeNull();
    });

    it('returns 200 with resolved: true and visualResult: POSITIVE', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: true,
        predictionFailed: false,
        visualResult: 'POSITIVE',
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        resolved: true,
        predictionFailed: false,
        visualResult: 'POSITIVE',
      });
      expect(body.error).toBeNull();
    });

    it('returns 200 with resolved: true and visualResult: NEGATIVE', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: true,
        predictionFailed: false,
        visualResult: 'NEGATIVE',
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        resolved: true,
        predictionFailed: false,
        visualResult: 'NEGATIVE',
      });
      expect(body.error).toBeNull();
    });

    it('returns 200 with predictionFailed: true when prediction exhausted retries', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: true,
        predictionFailed: true,
        visualResult: 'NEGATIVE',
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        resolved: true,
        predictionFailed: true,
        visualResult: 'NEGATIVE',
      });
      expect(body.error).toBeNull();
    });

    it('calls getImageGateStatus with the correct sessionId', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      await GET(request, makeParams(VALID_SESSION_ID));

      expect(mockGetImageGateStatus).toHaveBeenCalledWith(VALID_SESSION_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation Errors
  // ---------------------------------------------------------------------------

  describe('validation errors', () => {
    it('returns 400 when sessionId is not a valid UUID', async () => {
      const request = makeRequest('not-a-uuid');
      const response = await GET(request, makeParams('not-a-uuid'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid session ID');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'sessionId',
            message: expect.stringContaining('UUID'),
          }),
        ]),
      );
      expect(mockGetImageGateStatus).not.toHaveBeenCalled();
    });

    it('returns 400 when sessionId is empty string', async () => {
      const request = makeRequest('');
      const response = await GET(request, makeParams(''));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(mockGetImageGateStatus).not.toHaveBeenCalled();
    });

    it('returns 400 when sessionId has invalid format', async () => {
      const request = makeRequest('550e8400-invalid-format');
      const response = await GET(request, makeParams('550e8400-invalid-format'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(mockGetImageGateStatus).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
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

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toBe('Rate limit exceeded');
      expect(response.headers.get('Retry-After')).toBe('45');
      expect(mockGetImageGateStatus).not.toHaveBeenCalled();
    });

    it('includes X-RateLimit-* headers on success', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));

      expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('29');
    });
  });

  // ---------------------------------------------------------------------------
  // Service Errors
  // ---------------------------------------------------------------------------

  describe('service errors', () => {
    it('returns appropriate status for AppError from service', async () => {
      const appError = new AppError('Session not found', 404, 'NOT_FOUND');
      mockGetImageGateStatus.mockRejectedValue(appError);

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Session not found');
    });

    it('returns 500 on unexpected errors', async () => {
      mockGetImageGateStatus.mockRejectedValue(new Error('Database connection failed'));

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
    });
  });

  // ---------------------------------------------------------------------------
  // Response Metadata
  // ---------------------------------------------------------------------------

  describe('response metadata', () => {
    it('includes requestId in response meta', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(body.meta.requestId).toBeDefined();
      expect(typeof body.meta.requestId).toBe('string');
      expect(body.meta.requestId.length).toBeGreaterThan(0);
    });

    it('includes timestamp in response meta', async () => {
      mockGetImageGateStatus.mockResolvedValue({
        resolved: false,
        predictionFailed: false,
        visualResult: null,
      });

      const request = makeRequest(VALID_SESSION_ID);
      const response = await GET(request, makeParams(VALID_SESSION_ID));
      const body = await response.json();

      expect(body.meta.timestamp).toBeDefined();
      expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
    });
  });
});
