import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { checkRateLimit, _resetRateLimitStore } from './rate-limiter';

/**
 * Property-based tests for the rate limiter.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

// ─── Helpers ───

/** Generate a unique key per test run to avoid interference */
let keyCounter = 0;
function uniqueKey(): string {
  return `pbt-rate-limit-${Date.now()}-${keyCounter++}`;
}

// ─── Setup ───

beforeEach(() => {
  _resetRateLimitStore();
});

// ─── Property Tests ───

// Feature: screening-api, Property 3: Rate limiter allows requests within window
describe('Feature: screening-api, Property 3: Rate limiter allows requests within window', () => {
  it('all N calls (N ≤ M) return allowed: true with remaining decreasing from M-1 to M-N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }), // maxRequests M
        fc.integer({ min: 1, max: 300 }), // windowSeconds W
        (maxRequests, windowSeconds) => {
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };

          // Call exactly maxRequests times (N = M, worst case within limit)
          for (let i = 0; i < maxRequests; i++) {
            const result = checkRateLimit(key, config);

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(maxRequests - (i + 1));
            expect(result.limit).toBe(maxRequests);
            expect(result.retryAfterSeconds).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('partial usage (N < M) leaves remaining correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }), // maxRequests M (at least 2 so N can be < M)
        fc.integer({ min: 1, max: 300 }), // windowSeconds W
        (maxRequests, windowSeconds) => {
          const N = Math.max(1, Math.floor(maxRequests / 2)); // N < M
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };

          for (let i = 0; i < N; i++) {
            const result = checkRateLimit(key, config);

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(maxRequests - (i + 1));
          }

          // After N calls, remaining should be M - N
          const lastResult = checkRateLimit(key, config);
          expect(lastResult.allowed).toBe(true);
          expect(lastResult.remaining).toBe(maxRequests - N - 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resetAt is always a future UNIX timestamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 300 }),
        (maxRequests, windowSeconds) => {
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };
          const beforeSeconds = Math.floor(Date.now() / 1000);

          const result = checkRateLimit(key, config);

          expect(result.resetAt).toBeGreaterThanOrEqual(beforeSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: screening-api, Property 4: Rate limiter blocks requests exceeding window
describe('Feature: screening-api, Property 4: Rate limiter blocks requests exceeding window', () => {
  it('the (M+1)th call returns allowed: false with remaining: 0 and non-null retryAfterSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // maxRequests M (smaller range for speed)
        fc.integer({ min: 1, max: 300 }), // windowSeconds W
        (maxRequests, windowSeconds) => {
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };

          // Exhaust the limit: call M times
          for (let i = 0; i < maxRequests; i++) {
            const result = checkRateLimit(key, config);
            expect(result.allowed).toBe(true);
          }

          // The (M+1)th call should be blocked
          const blocked = checkRateLimit(key, config);

          expect(blocked.allowed).toBe(false);
          expect(blocked.remaining).toBe(0);
          expect(blocked.limit).toBe(maxRequests);
          expect(blocked.retryAfterSeconds).not.toBeNull();
          expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('subsequent calls after exhaustion remain blocked', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 5 }), // extra calls after exhaustion
        (maxRequests, windowSeconds, extraCalls) => {
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };

          // Exhaust the limit
          for (let i = 0; i < maxRequests; i++) {
            checkRateLimit(key, config);
          }

          // All subsequent calls should be blocked
          for (let i = 0; i < extraCalls; i++) {
            const result = checkRateLimit(key, config);

            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfterSeconds).not.toBeNull();
            expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('retryAfterSeconds does not exceed windowSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 300 }),
        (maxRequests, windowSeconds) => {
          const key = uniqueKey();
          const config = { maxRequests, windowSeconds };

          // Exhaust the limit
          for (let i = 0; i < maxRequests; i++) {
            checkRateLimit(key, config);
          }

          const blocked = checkRateLimit(key, config);

          expect(blocked.retryAfterSeconds).not.toBeNull();
          expect(blocked.retryAfterSeconds!).toBeLessThanOrEqual(windowSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
