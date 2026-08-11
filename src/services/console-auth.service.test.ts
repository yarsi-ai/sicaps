import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/console-auth', () => ({
  checkPinRateLimit: vi.fn(),
  recordFailedPinAttempt: vi.fn(),
  resetPinRateLimit: vi.fn(),
  verifyPin: vi.fn(),
  createSessionCookie: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    CONSOLE_PIN: 'test-pin-123',
  },
}));

import {
  checkPinRateLimit,
  createSessionCookie,
  recordFailedPinAttempt,
  resetPinRateLimit,
  verifyPin,
} from '@/lib/console-auth';
import { InvalidPinError, RateLimitError, ValidationError } from '@/lib/errors';
import { verifyConsolePin } from './console-auth.service';

const mockCheckPinRateLimit = vi.mocked(checkPinRateLimit);
const mockRecordFailedPinAttempt = vi.mocked(recordFailedPinAttempt);
const mockResetPinRateLimit = vi.mocked(resetPinRateLimit);
const mockVerifyPin = vi.mocked(verifyPin);
const mockCreateSessionCookie = vi.mocked(createSessionCookie);

describe('verifyConsolePin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPinRateLimit.mockReturnValue({
      allowed: true,
      remaining: 5,
      resetAt: Math.floor(Date.now() / 1000) + 900,
    });
    mockCreateSessionCookie.mockReturnValue('mock-session-cookie-value');
  });

  describe('success flow', () => {
    it('returns redirect and cookieValue on correct PIN', () => {
      mockVerifyPin.mockReturnValue(true);

      const result = verifyConsolePin({ ip: '127.0.0.1', pin: 'correct-pin' });

      expect(result).toEqual({ redirect: '/console', cookieValue: 'mock-session-cookie-value' });
      expect(mockVerifyPin).toHaveBeenCalledWith('correct-pin', 'test-pin-123');
    });

    it('returns the provided redirect path when given', () => {
      mockVerifyPin.mockReturnValue(true);

      const result = verifyConsolePin({
        ip: '127.0.0.1',
        pin: 'correct-pin',
        redirect: '/console/testing',
      });

      expect(result.redirect).toBe('/console/testing');
    });

    it('resets the rate limit on successful verification', () => {
      mockVerifyPin.mockReturnValue(true);

      verifyConsolePin({ ip: '127.0.0.1', pin: 'correct-pin' });

      expect(mockResetPinRateLimit).toHaveBeenCalledWith('127.0.0.1');
    });
  });

  describe('incorrect PIN', () => {
    it('throws InvalidPinError and records a failed attempt', () => {
      mockVerifyPin.mockReturnValue(false);

      expect(() => verifyConsolePin({ ip: '127.0.0.1', pin: 'wrong-pin' })).toThrow(
        InvalidPinError,
      );
      expect(mockRecordFailedPinAttempt).toHaveBeenCalledWith('127.0.0.1');
      expect(mockResetPinRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('empty/whitespace PIN', () => {
    it('throws ValidationError and records a failed attempt for empty string', () => {
      expect(() => verifyConsolePin({ ip: '127.0.0.1', pin: '' })).toThrow(ValidationError);
      expect(mockRecordFailedPinAttempt).toHaveBeenCalledWith('127.0.0.1');
      expect(mockVerifyPin).not.toHaveBeenCalled();
    });

    it('throws ValidationError for whitespace-only PIN', () => {
      expect(() => verifyConsolePin({ ip: '127.0.0.1', pin: '   ' })).toThrow(ValidationError);
      expect(mockRecordFailedPinAttempt).toHaveBeenCalledWith('127.0.0.1');
    });
  });

  describe('rate limiting', () => {
    it('throws RateLimitError without checking the PIN when rate limited', () => {
      mockCheckPinRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 900,
      });

      expect(() => verifyConsolePin({ ip: '127.0.0.1', pin: 'any-pin' })).toThrow(RateLimitError);
      expect(mockVerifyPin).not.toHaveBeenCalled();
      expect(mockRecordFailedPinAttempt).not.toHaveBeenCalled();
    });
  });
});
