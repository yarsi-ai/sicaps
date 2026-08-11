import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

// Mock dependencies
vi.mock('@/lib/api/ip', () => ({
  getClientIp: vi.fn(),
}));

vi.mock('@/services/console-auth.service', () => ({
  verifyConsolePin: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    CONSOLE_PIN: 'test-pin-123',
    NODE_ENV: 'test',
  },
}));

vi.mock('@/lib/config', () => ({
  CONFIG: {
    console: {
      SESSION_COOKIE_NAME: 'console_session',
      SESSION_DURATION_HOURS: 24,
      PIN_RATE_LIMIT: {
        maxAttempts: 5,
        windowSeconds: 900,
      },
    },
  },
}));

import { getClientIp } from '@/lib/api/ip';
import { verifyConsolePin } from '@/services/console-auth.service';
import { InvalidPinError, RateLimitError, ValidationError } from '@/lib/errors';

const mockGetClientIp = vi.mocked(getClientIp);
const mockVerifyConsolePin = vi.mocked(verifyConsolePin);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/console/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Unit tests for POST /api/console/auth/verify
 *
 * The route handler delegates all business logic to
 * `services/console-auth.service.ts`. These tests verify the HTTP glue:
 * request parsing, service invocation, response envelope shape, and
 * AppError -> HTTP status mapping.
 *
 * **Validates: Requirements 1.4, 3.1, 4.1**
 */
describe('POST /api/console/auth/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
  });

  describe('success flow', () => {
    it('returns 200, envelope with redirect, and sets session cookie on correct PIN', async () => {
      mockVerifyConsolePin.mockReturnValue({
        redirect: '/console',
        cookieValue: 'mock-session-cookie-value',
      });

      const response = await POST(makeRequest({ pin: 'correct-pin' }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.error).toBeNull();
      expect(body.data).toEqual({ redirect: '/console' });
      expect(mockVerifyConsolePin).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        pin: 'correct-pin',
        redirect: undefined,
      });

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('console_session=mock-session-cookie-value');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader?.toLowerCase()).toContain('samesite=lax');
    });

    it('returns the redirect path provided by the service', async () => {
      mockVerifyConsolePin.mockReturnValue({
        redirect: '/console/testing',
        cookieValue: 'mock-session-cookie-value',
      });

      const response = await POST(
        makeRequest({ pin: 'correct-pin', redirect: '/console/testing' }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.redirect).toBe('/console/testing');
      expect(mockVerifyConsolePin).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        pin: 'correct-pin',
        redirect: '/console/testing',
      });
    });

    it('does not set a `path` restriction on the session cookie (Requirement 1.5)', async () => {
      mockVerifyConsolePin.mockReturnValue({
        redirect: '/console',
        cookieValue: 'mock-session-cookie-value',
      });

      const response = await POST(makeRequest({ pin: 'correct-pin' }));
      const setCookieHeader = response.headers.get('set-cookie');

      // Cookie must be sent for /api/console/* routes too, not just /console/* pages
      expect(setCookieHeader).not.toContain('Path=/console');
    });
  });

  describe('failure flow', () => {
    it('returns 401 with generic error message on incorrect PIN', async () => {
      mockVerifyConsolePin.mockImplementation(() => {
        throw new InvalidPinError();
      });

      const response = await POST(makeRequest({ pin: 'wrong-pin' }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.data).toBeNull();
      expect(body.error).toEqual({
        code: 'INVALID_PIN',
        message: 'Incorrect PIN',
        details: null,
      });
    });
  });

  describe('validation errors', () => {
    it('returns 400 on empty PIN', async () => {
      mockVerifyConsolePin.mockImplementation(() => {
        throw new ValidationError('PIN is required');
      });

      const response = await POST(makeRequest({ pin: '' }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.data).toBeNull();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('treats missing/invalid JSON body as an empty PIN passed to the service', async () => {
      mockVerifyConsolePin.mockImplementation(() => {
        throw new ValidationError('PIN is required');
      });

      const request = new NextRequest('http://localhost:3000/api/console/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(mockVerifyConsolePin).toHaveBeenCalledWith({
        ip: '127.0.0.1',
        pin: '',
        redirect: undefined,
      });
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when the service reports rate limiting', async () => {
      mockVerifyConsolePin.mockImplementation(() => {
        throw new RateLimitError('Too many attempts. Please wait before trying again.');
      });

      const response = await POST(makeRequest({ pin: 'any-pin' }));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 with generic message for non-AppError failures', async () => {
      mockVerifyConsolePin.mockImplementation(() => {
        throw new Error('boom');
      });

      const response = await POST(makeRequest({ pin: 'any-pin' }));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('cookie settings', () => {
    beforeEach(() => {
      mockVerifyConsolePin.mockReturnValue({
        redirect: '/console',
        cookieValue: 'mock-session-cookie-value',
      });
    });

    it('sets httpOnly cookie', async () => {
      const response = await POST(makeRequest({ pin: 'correct-pin' }));
      const setCookieHeader = response.headers.get('set-cookie');

      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('sets SameSite=Lax cookie', async () => {
      const response = await POST(makeRequest({ pin: 'correct-pin' }));
      const setCookieHeader = response.headers.get('set-cookie');

      expect(setCookieHeader?.toLowerCase()).toContain('samesite=lax');
    });

    it('sets 24h maxAge on cookie', async () => {
      const response = await POST(makeRequest({ pin: 'correct-pin' }));
      const setCookieHeader = response.headers.get('set-cookie');

      // 24 hours = 86400 seconds
      expect(setCookieHeader).toContain('Max-Age=86400');
    });
  });
});
