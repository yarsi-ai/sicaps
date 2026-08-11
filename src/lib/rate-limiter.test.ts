import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  checkRateLimit,
  safeCheckRateLimit,
  getRateLimitHeaders,
  _resetRateLimitStore,
} from './rate-limiter';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const config = { maxRequests: 3, windowSeconds: 60 };

  it('allows the first request and reports correct remaining', () => {
    const result = checkRateLimit('session-1', config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it('decrements remaining on each allowed request', () => {
    checkRateLimit('session-1', config);
    const second = checkRateLimit('session-1', config);
    const third = checkRateLimit('session-1', config);

    expect(second.remaining).toBe(1);
    expect(third.remaining).toBe(0);
    expect(third.allowed).toBe(true);
  });

  it('rejects requests after maxRequests are exhausted', () => {
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);

    const fourth = checkRateLimit('session-1', config);

    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('provides correct resetAt as Unix epoch seconds', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = checkRateLimit('session-1', config);

    expect(result.resetAt).toBe(nowSeconds + config.windowSeconds);
  });

  it('calculates retryAfterSeconds relative to earliest request expiry', () => {
    // Fill the window
    checkRateLimit('session-1', config);
    vi.advanceTimersByTime(10_000); // +10s
    checkRateLimit('session-1', config);
    vi.advanceTimersByTime(10_000); // +20s
    checkRateLimit('session-1', config);

    // Try one more at +20s from start
    const rejected = checkRateLimit('session-1', config);

    expect(rejected.allowed).toBe(false);
    // Earliest request was at t=0, expires at t=60
    // Current time is t=20s, so retryAfter = 60 - 20 = 40
    expect(rejected.retryAfterSeconds).toBe(40);
  });

  it('allows requests again after the window slides past oldest timestamp', () => {
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);

    // Advance past the window
    vi.advanceTimersByTime(61_000);

    const result = checkRateLimit('session-1', config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('isolates different keys from each other', () => {
    checkRateLimit('session-a', config);
    checkRateLimit('session-a', config);
    checkRateLimit('session-a', config);

    const resultB = checkRateLimit('session-b', config);

    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(2);
  });

  it('retryAfterSeconds is at least 1 even at boundary', () => {
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);
    checkRateLimit('session-1', config);

    // Advance to just before the earliest timestamp expires
    vi.advanceTimersByTime(59_999);

    const rejected = checkRateLimit('session-1', config);

    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('getRateLimitHeaders', () => {
  it('returns correct header map for allowed result', () => {
    const result = {
      allowed: true,
      remaining: 7,
      limit: 10,
      resetAt: 1735689660,
      retryAfterSeconds: null,
    };

    const headers = getRateLimitHeaders(result);

    expect(headers).toEqual({
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '7',
      'X-RateLimit-Reset': '1735689660',
    });
  });

  it('returns correct header map for rejected result', () => {
    const result = {
      allowed: false,
      remaining: 0,
      limit: 10,
      resetAt: 1735689660,
      retryAfterSeconds: 30,
    };

    const headers = getRateLimitHeaders(result);

    expect(headers).toEqual({
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1735689660',
    });
  });

  it('converts all values to strings', () => {
    const result = {
      allowed: true,
      remaining: 0,
      limit: 1,
      resetAt: 0,
      retryAfterSeconds: null,
    };

    const headers = getRateLimitHeaders(result);

    Object.values(headers).forEach((value) => {
      expect(typeof value).toBe('string');
    });
  });
});

describe('safeCheckRateLimit', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const config = { maxRequests: 5, windowSeconds: 60 };

  it('delegates to checkRateLimit when no error occurs', () => {
    const result = safeCheckRateLimit('safe-key', config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it('returns fail-open result and warns on error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Monkey-patch Date.now to throw, simulating an unexpected error
    const originalDateNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Simulated internal failure');
    });

    const result = safeCheckRateLimit('error-key', config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(config.maxRequests);
    expect(result.resetAt).toBe(0);
    expect(result.retryAfterSeconds).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      '[rate-limiter] Unexpected error during rate limit check:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
    vi.spyOn(Date, 'now').mockImplementation(originalDateNow);
  });

  it('preserves rate limit state from successful calls', () => {
    safeCheckRateLimit('state-key', config);
    safeCheckRateLimit('state-key', config);
    const third = safeCheckRateLimit('state-key', config);

    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(2);
  });
});

/**
 * Property-based tests for rate limiter.
 *
 * Validates: Requirements 7.1, 7.3
 */
describe('checkRateLimit property tests', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Property 8: Rate limiter window invariant — N requests within window all allowed with correct remaining', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 20 })
          .chain((maxRequests) =>
            fc.tuple(fc.constant(maxRequests), fc.integer({ min: 1, max: maxRequests })),
          ),
        ([maxRequests, n]) => {
          _resetRateLimitStore();

          const key = `property-test-${maxRequests}-${n}`;
          const config = { maxRequests, windowSeconds: 60 };

          const results = [];
          for (let i = 0; i < n; i++) {
            results.push(checkRateLimit(key, config));
          }

          // All N calls must be allowed
          for (let i = 0; i < n; i++) {
            expect(results[i]!.allowed).toBe(true);
          }

          // The Nth call (last one) must have remaining === maxRequests - N
          expect(results[n - 1]!.remaining).toBe(maxRequests - n);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 9: Rate limiter blocks after exhaustion
   *
   * Validates: Requirements 7.2
   */
  it('Property 9: blocks after exhaustion — extra request returns allowed: false with positive retryAfterSeconds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (maxRequests) => {
        _resetRateLimitStore();

        const key = `exhaustion-test-${maxRequests}`;
        const config = { maxRequests, windowSeconds: 60 };

        // Exhaust all allowed requests
        for (let i = 0; i < maxRequests; i++) {
          const result = checkRateLimit(key, config);
          expect(result.allowed).toBe(true);
        }

        // One more request after exhaustion must be blocked
        const blocked = checkRateLimit(key, config);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).not.toBeNull();
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
