import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinRateLimit,
  _resetPinAttemptStore,
  _getStoreSize,
} from './rate-limit';
import { CONFIG } from '../config';

describe('checkPinRateLimit', () => {
  beforeEach(() => {
    _resetPinAttemptStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first attempt for new IP', () => {
    const result = checkPinRateLimit('192.168.1.1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CONFIG.console.PIN_RATE_LIMIT.maxAttempts);
  });

  it('allows attempts when under limit', () => {
    const ip = '192.168.1.2';

    // Record 3 failed attempts
    recordFailedPinAttempt(ip);
    recordFailedPinAttempt(ip);
    recordFailedPinAttempt(ip);

    const result = checkPinRateLimit(ip);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CONFIG.console.PIN_RATE_LIMIT.maxAttempts - 3);
  });

  it('blocks IP after reaching maxAttempts', () => {
    const ip = '192.168.1.3';
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Record maxAttempts failed attempts
    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip);
    }

    const result = checkPinRateLimit(ip);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('uses custom config when provided', () => {
    const ip = '192.168.1.4';
    const customConfig = { maxAttempts: 2, windowSeconds: 60 };

    recordFailedPinAttempt(ip, customConfig);
    recordFailedPinAttempt(ip, customConfig);

    const result = checkPinRateLimit(ip, customConfig);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows attempts again after window expires', () => {
    const ip = '192.168.1.5';
    const windowSeconds = CONFIG.console.PIN_RATE_LIMIT.windowSeconds;
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Fill up the attempts
    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip);
    }

    expect(checkPinRateLimit(ip).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime((windowSeconds + 1) * 1000);

    const result = checkPinRateLimit(ip);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(maxAttempts);
  });

  it('returns correct resetAt timestamp', () => {
    const ip = '192.168.1.6';
    const now = Date.now();
    vi.setSystemTime(now);

    recordFailedPinAttempt(ip);

    const result = checkPinRateLimit(ip);
    const expectedResetAt = Math.floor(now / 1000) + CONFIG.console.PIN_RATE_LIMIT.windowSeconds;

    expect(result.resetAt).toBe(expectedResetAt);
  });

  it('tracks separate limits for different IPs', () => {
    const ip1 = '192.168.1.7';
    const ip2 = '192.168.1.8';
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Block ip1
    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip1);
    }

    // ip1 is blocked
    expect(checkPinRateLimit(ip1).allowed).toBe(false);
    // ip2 is still allowed
    expect(checkPinRateLimit(ip2).allowed).toBe(true);
  });

  it('partially expires old attempts within window', () => {
    const ip = '192.168.1.9';
    const windowSeconds = CONFIG.console.PIN_RATE_LIMIT.windowSeconds;
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Record maxAttempts - 1 attempts
    for (let i = 0; i < maxAttempts - 1; i++) {
      recordFailedPinAttempt(ip);
    }

    // Advance time to just before window expiry
    vi.advanceTimersByTime((windowSeconds - 10) * 1000);

    // Add one more attempt (should fill the limit)
    recordFailedPinAttempt(ip);

    // Not blocked yet (old attempts still in window)
    expect(checkPinRateLimit(ip).allowed).toBe(false);

    // Advance past the original window (old attempts expire)
    vi.advanceTimersByTime(15 * 1000);

    // Now allowed (only the recent attempt remains)
    const result = checkPinRateLimit(ip);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(maxAttempts - 1);
  });
});

describe('recordFailedPinAttempt', () => {
  beforeEach(() => {
    _resetPinAttemptStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a failed attempt', () => {
    const ip = '192.168.2.1';

    const beforeResult = checkPinRateLimit(ip);
    recordFailedPinAttempt(ip);
    const afterResult = checkPinRateLimit(ip);

    expect(afterResult.remaining).toBe(beforeResult.remaining - 1);
  });

  it('accumulates multiple failed attempts', () => {
    const ip = '192.168.2.2';
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip);
    }

    expect(checkPinRateLimit(ip).remaining).toBe(0);
  });

  it('filters expired attempts when recording', () => {
    const ip = '192.168.2.3';
    const windowSeconds = CONFIG.console.PIN_RATE_LIMIT.windowSeconds;

    // Record an attempt
    recordFailedPinAttempt(ip);

    // Advance past the window
    vi.advanceTimersByTime((windowSeconds + 1) * 1000);

    // Record another attempt (should filter out the old one)
    recordFailedPinAttempt(ip);

    const result = checkPinRateLimit(ip);
    // Only one active attempt
    expect(result.remaining).toBe(CONFIG.console.PIN_RATE_LIMIT.maxAttempts - 1);
  });
});

describe('resetPinRateLimit', () => {
  beforeEach(() => {
    _resetPinAttemptStore();
  });

  it('clears failed attempts for IP on successful PIN', () => {
    const ip = '192.168.3.1';
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Fill up attempts
    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip);
    }

    expect(checkPinRateLimit(ip).allowed).toBe(false);

    // Reset on successful PIN
    resetPinRateLimit(ip);

    const result = checkPinRateLimit(ip);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(maxAttempts);
  });

  it('only affects the specified IP', () => {
    const ip1 = '192.168.3.2';
    const ip2 = '192.168.3.3';
    const maxAttempts = CONFIG.console.PIN_RATE_LIMIT.maxAttempts;

    // Block both IPs
    for (let i = 0; i < maxAttempts; i++) {
      recordFailedPinAttempt(ip1);
      recordFailedPinAttempt(ip2);
    }

    // Reset only ip1
    resetPinRateLimit(ip1);

    // ip1 is allowed again
    expect(checkPinRateLimit(ip1).allowed).toBe(true);
    // ip2 is still blocked
    expect(checkPinRateLimit(ip2).allowed).toBe(false);
  });

  it('does nothing for unknown IP', () => {
    const ip = '192.168.3.4';

    // Should not throw
    expect(() => resetPinRateLimit(ip)).not.toThrow();
  });
});

describe('_resetPinAttemptStore', () => {
  it('clears all stored attempts', () => {
    recordFailedPinAttempt('ip1');
    recordFailedPinAttempt('ip2');
    recordFailedPinAttempt('ip3');

    expect(_getStoreSize()).toBeGreaterThan(0);

    _resetPinAttemptStore();

    expect(_getStoreSize()).toBe(0);
  });
});

describe('memory management', () => {
  beforeEach(() => {
    _resetPinAttemptStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans up expired entries when store exceeds threshold', () => {
    const windowSeconds = CONFIG.console.PIN_RATE_LIMIT.windowSeconds;

    // Add many IPs to trigger cleanup
    for (let i = 0; i < 1001; i++) {
      recordFailedPinAttempt(`192.168.${Math.floor(i / 256)}.${i % 256}`);
    }

    // Advance time past window
    vi.advanceTimersByTime((windowSeconds + 1) * 1000);

    // Trigger cleanup by checking a new IP
    checkPinRateLimit('new-ip');

    // Store should be cleaned up (only the fresh entry from checkPinRateLimit should remain)
    expect(_getStoreSize()).toBeLessThan(1001);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property-Based Tests for PIN Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

import * as fc from 'fast-check';

/**
 * Property-based tests for PIN rate limiting.
 *
 * **Property 5: Brute-force lockout after threshold**
 * **Validates: Requirements 4.1, 4.3**
 *
 * For any IP address that has recorded 5 or more failed PIN attempts within
 * the last 15 minutes, the Console_Guard SHALL reject further PIN verification
 * attempts without performing PIN comparison, until the oldest failed attempt
 * in the window expires.
 */

// ─── Arbitraries ───

/** Generate a valid IP address string */
const ipAddressArb = fc
  .tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generate an arbitrary number of attempts (0 to 20) */
const attemptCountArb = fc.integer({ min: 0, max: 20 });

/** Generate config with reasonable bounds for testing */
const configArb = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 10 }),
  windowSeconds: fc.integer({ min: 60, max: 3600 }),
});

// ─── Property Tests ───

describe('Feature: console-pin-protection, Property 5: Brute-force lockout after threshold', () => {
  beforeEach(() => {
    _resetPinAttemptStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property: After exactly maxAttempts failed attempts, the next check returns allowed: false
   *
   * For any IP and any config, if we record exactly maxAttempts failed attempts,
   * the next checkPinRateLimit call MUST return allowed: false.
   */
  it('blocks IP after exactly maxAttempts failed attempts', () => {
    fc.assert(
      fc.property(ipAddressArb, configArb, (ip, config) => {
        _resetPinAttemptStore();

        // Record exactly maxAttempts failed attempts
        for (let i = 0; i < config.maxAttempts; i++) {
          recordFailedPinAttempt(ip, config);
        }

        const result = checkPinRateLimit(ip, config);

        // After maxAttempts, must be blocked
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: After any N < maxAttempts failed attempts, the next check returns allowed: true
   *
   * For any IP, any config, and any N where 0 <= N < maxAttempts,
   * if we record N failed attempts, checkPinRateLimit MUST return allowed: true.
   */
  it('allows IP when failed attempts are below maxAttempts', () => {
    fc.assert(
      fc.property(ipAddressArb, configArb, (ip, config) => {
        _resetPinAttemptStore();

        // Generate N where 0 <= N < maxAttempts
        const n = Math.floor(Math.random() * config.maxAttempts);

        // Record N failed attempts (less than maxAttempts)
        for (let i = 0; i < n; i++) {
          recordFailedPinAttempt(ip, config);
        }

        const result = checkPinRateLimit(ip, config);

        // With fewer than maxAttempts, must be allowed
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(config.maxAttempts - n);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: After reset, checkPinRateLimit returns allowed: true regardless of previous attempts
   *
   * For any IP, any config, and any number of failed attempts (even exceeding maxAttempts),
   * after calling resetPinRateLimit, checkPinRateLimit MUST return allowed: true with full remaining.
   */
  it('allows IP after reset regardless of previous attempts', () => {
    fc.assert(
      fc.property(ipAddressArb, configArb, attemptCountArb, (ip, config, attemptCount) => {
        _resetPinAttemptStore();

        // Record arbitrary number of failed attempts
        for (let i = 0; i < attemptCount; i++) {
          recordFailedPinAttempt(ip, config);
        }

        // Reset the rate limit (simulates successful PIN submission)
        resetPinRateLimit(ip);

        const result = checkPinRateLimit(ip, config);

        // After reset, must be fully allowed again
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(config.maxAttempts);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Different IPs have independent rate limits
   *
   * For any two distinct IPs and any config, blocking one IP (by recording maxAttempts)
   * MUST NOT affect the other IP's rate limit status.
   */
  it('maintains independent rate limits per IP', () => {
    fc.assert(
      fc.property(
        ipAddressArb,
        ipAddressArb.filter((ip) => ip !== '1.1.1.1'), // ensure we can create distinct IPs
        configArb,
        (ip1, ip2Base, config) => {
          _resetPinAttemptStore();

          // Ensure IPs are distinct by modifying ip2 if they match
          const ip2 = ip1 === ip2Base ? `${ip2Base}.modified` : ip2Base;

          // Block ip1 by recording maxAttempts failed attempts
          for (let i = 0; i < config.maxAttempts; i++) {
            recordFailedPinAttempt(ip1, config);
          }

          // Check ip1 is blocked
          const result1 = checkPinRateLimit(ip1, config);
          expect(result1.allowed).toBe(false);

          // Check ip2 is still allowed (independent rate limit)
          const result2 = checkPinRateLimit(ip2, config);
          expect(result2.allowed).toBe(true);
          expect(result2.remaining).toBe(config.maxAttempts);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Remaining attempts decrease correctly with each failed attempt
   *
   * For any IP and config, the remaining count should decrease by 1 for each
   * failed attempt until it reaches 0.
   */
  it('remaining decreases correctly with each failed attempt', () => {
    fc.assert(
      fc.property(ipAddressArb, configArb, attemptCountArb, (ip, config, attemptCount) => {
        _resetPinAttemptStore();

        // Limit attempts to maxAttempts to avoid checking blocked state
        const attempts = Math.min(attemptCount, config.maxAttempts);

        for (let i = 0; i < attempts; i++) {
          recordFailedPinAttempt(ip, config);
          const result = checkPinRateLimit(ip, config);

          if (i + 1 < config.maxAttempts) {
            // Still under limit
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(config.maxAttempts - (i + 1));
          } else {
            // At or over limit
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Reset only affects the specified IP, not others
   *
   * For any two distinct IPs where both are blocked, resetting one IP
   * MUST NOT affect the other IP's blocked status.
   */
  it('reset only affects the specified IP', () => {
    fc.assert(
      fc.property(ipAddressArb, ipAddressArb, configArb, (ip1, ip2Base, config) => {
        _resetPinAttemptStore();

        // Ensure IPs are distinct
        const ip2 = ip1 === ip2Base ? `${ip2Base}.x` : ip2Base;

        // Block both IPs
        for (let i = 0; i < config.maxAttempts; i++) {
          recordFailedPinAttempt(ip1, config);
          recordFailedPinAttempt(ip2, config);
        }

        // Both should be blocked
        expect(checkPinRateLimit(ip1, config).allowed).toBe(false);
        expect(checkPinRateLimit(ip2, config).allowed).toBe(false);

        // Reset only ip1
        resetPinRateLimit(ip1);

        // ip1 should be allowed, ip2 should still be blocked
        expect(checkPinRateLimit(ip1, config).allowed).toBe(true);
        expect(checkPinRateLimit(ip2, config).allowed).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
