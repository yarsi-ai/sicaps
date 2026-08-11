import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import {
  createSessionCookie,
  validateSessionCookie,
  isSessionExpired,
  ConsoleSessionCookie,
} from './session';
import { CONFIG } from '../config';

describe('createSessionCookie', () => {
  const SECRET = 'test-secret-key';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a cookie with correct format (payload.signature)', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    const cookie = createSessionCookie(SECRET);

    const parts = cookie.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });

  it('creates a cookie with iat set to current time', () => {
    const timestamp = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(timestamp);

    const cookie = createSessionCookie(SECRET);
    const payloadBase64 = cookie.split('.')[0]!;
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));

    expect(payload.iat).toBe(Math.floor(timestamp.getTime() / 1000));
  });

  it('creates a cookie with exp set to iat + 24 hours', () => {
    const timestamp = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(timestamp);

    const cookie = createSessionCookie(SECRET);
    const payloadBase64 = cookie.split('.')[0]!;
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));

    const expectedExp = Math.floor(timestamp.getTime() / 1000) + 24 * 60 * 60;
    expect(payload.exp).toBe(expectedExp);
  });

  it('uses SESSION_DURATION_HOURS from config', () => {
    const timestamp = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(timestamp);

    const cookie = createSessionCookie(SECRET);
    const payloadBase64 = cookie.split('.')[0]!;
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));

    const expectedDuration = CONFIG.console.SESSION_DURATION_HOURS * 60 * 60;
    expect(payload.exp - payload.iat).toBe(expectedDuration);
  });

  it('produces different signatures for different secrets', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    const cookie1 = createSessionCookie('secret-1');
    const cookie2 = createSessionCookie('secret-2');

    const sig1 = cookie1.split('.')[1];
    const sig2 = cookie2.split('.')[1];

    expect(sig1).not.toBe(sig2);
  });

  it('produces consistent cookies for the same secret and time', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    const cookie1 = createSessionCookie(SECRET);
    const cookie2 = createSessionCookie(SECRET);

    expect(cookie1).toBe(cookie2);
  });
});

describe('validateSessionCookie', () => {
  const SECRET = 'test-secret-key';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('valid cookies', () => {
    it('returns payload for valid, non-expired cookie', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);

      // Advance time by 1 hour (still valid)
      vi.setSystemTime(new Date('2024-01-15T13:00:00Z'));
      const result = validateSessionCookie(cookie, SECRET);

      expect(result).not.toBeNull();
      expect(result?.iat).toBe(Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000));
    });

    it('returns payload with correct iat and exp fields', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);
      const cookie = createSessionCookie(SECRET);

      const result = validateSessionCookie(cookie, SECRET);

      expect(result).toEqual({
        iat: Math.floor(createTime.getTime() / 1000),
        exp: Math.floor(createTime.getTime() / 1000) + 24 * 60 * 60,
      });
    });
  });

  describe('invalid format', () => {
    it('returns null for cookie without separator', () => {
      const result = validateSessionCookie('invalidcookiewithoutdot', SECRET);
      expect(result).toBeNull();
    });

    it('returns null for cookie with multiple separators', () => {
      const result = validateSessionCookie('part1.part2.part3', SECRET);
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = validateSessionCookie('', SECRET);
      expect(result).toBeNull();
    });

    it('returns null for just a separator', () => {
      const result = validateSessionCookie('.', SECRET);
      expect(result).toBeNull();
    });
  });

  describe('invalid signature', () => {
    it('returns null when signature is tampered', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);
      const [payload] = cookie.split('.');

      const tamperedCookie = `${payload}.invalidSignature`;
      const result = validateSessionCookie(tamperedCookie, SECRET);

      expect(result).toBeNull();
    });

    it('returns null when validated with wrong secret', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);

      const result = validateSessionCookie(cookie, 'wrong-secret');
      expect(result).toBeNull();
    });

    it('returns null when payload is modified', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);
      const [, signature] = cookie.split('.');

      // Create a modified payload
      const modifiedPayload = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 999999, // Extended expiry
      };
      const modifiedBase64 = Buffer.from(JSON.stringify(modifiedPayload)).toString('base64url');

      const tamperedCookie = `${modifiedBase64}.${signature}`;
      const result = validateSessionCookie(tamperedCookie, SECRET);

      expect(result).toBeNull();
    });
  });

  describe('invalid payload', () => {
    it('returns null for non-JSON payload', () => {
      const invalidPayload = Buffer.from('not-json').toString('base64url');
      const signature = 'somesignature';
      const result = validateSessionCookie(`${invalidPayload}.${signature}`, SECRET);
      expect(result).toBeNull();
    });

    it('returns null when payload missing iat', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);

      const payload = { exp: Math.floor(createTime.getTime() / 1000) + 86400 };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      // Sign it properly so we get past signature check
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(payloadBase64)
        .digest('base64url');

      const result = validateSessionCookie(`${payloadBase64}.${signature}`, SECRET);
      expect(result).toBeNull();
    });

    it('returns null when payload missing exp', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);

      const payload = { iat: Math.floor(createTime.getTime() / 1000) };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(payloadBase64)
        .digest('base64url');

      const result = validateSessionCookie(`${payloadBase64}.${signature}`, SECRET);
      expect(result).toBeNull();
    });

    it('returns null when iat is not a number', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);

      const payload = { iat: 'not-a-number', exp: Math.floor(createTime.getTime() / 1000) + 86400 };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(payloadBase64)
        .digest('base64url');

      const result = validateSessionCookie(`${payloadBase64}.${signature}`, SECRET);
      expect(result).toBeNull();
    });

    it('returns null when exp is not a number', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);

      const payload = { iat: Math.floor(createTime.getTime() / 1000), exp: 'not-a-number' };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(payloadBase64)
        .digest('base64url');

      const result = validateSessionCookie(`${payloadBase64}.${signature}`, SECRET);
      expect(result).toBeNull();
    });

    it('returns null for null payload', () => {
      const createTime = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(createTime);

      const payloadBase64 = Buffer.from('null').toString('base64url');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(payloadBase64)
        .digest('base64url');

      const result = validateSessionCookie(`${payloadBase64}.${signature}`, SECRET);
      expect(result).toBeNull();
    });
  });

  describe('expired sessions', () => {
    it('returns null when session has expired', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);

      // Advance time by 25 hours (past 24h expiry)
      vi.setSystemTime(new Date('2024-01-16T13:00:00Z'));
      const result = validateSessionCookie(cookie, SECRET);

      expect(result).toBeNull();
    });

    it('returns null when session expires exactly at exp time', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);

      // Advance time to exactly 24 hours later
      vi.setSystemTime(new Date('2024-01-16T12:00:00Z'));
      const result = validateSessionCookie(cookie, SECRET);

      expect(result).toBeNull();
    });

    it('returns valid payload 1 second before expiry', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      const cookie = createSessionCookie(SECRET);

      // Advance to 1 second before expiry (23:59:59 later)
      vi.setSystemTime(new Date('2024-01-16T11:59:59Z'));
      const result = validateSessionCookie(cookie, SECRET);

      expect(result).not.toBeNull();
    });
  });
});

describe('isSessionExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for session that has not expired', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    const session: ConsoleSessionCookie = {
      iat: Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000),
      exp: Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000),
    };

    expect(isSessionExpired(session)).toBe(false);
  });

  it('returns true for session that has expired', () => {
    vi.setSystemTime(new Date('2024-01-17T12:00:00Z'));

    const session: ConsoleSessionCookie = {
      iat: Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000),
      exp: Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000),
    };

    expect(isSessionExpired(session)).toBe(true);
  });

  it('returns true exactly at expiration time', () => {
    vi.setSystemTime(new Date('2024-01-16T12:00:00Z'));

    const session: ConsoleSessionCookie = {
      iat: Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000),
      exp: Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000),
    };

    expect(isSessionExpired(session)).toBe(true);
  });

  it('returns false 1 second before expiration', () => {
    vi.setSystemTime(new Date('2024-01-16T11:59:59Z'));

    const session: ConsoleSessionCookie = {
      iat: Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000),
      exp: Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000),
    };

    expect(isSessionExpired(session)).toBe(false);
  });

  it('uses absolute expiry (not sliding window)', () => {
    // Session created at noon, expires at noon next day
    const iat = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
    const exp = Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000);
    const session: ConsoleSessionCookie = { iat, exp };

    // Even if we check it multiple times during the day, it should expire at the same time
    vi.setSystemTime(new Date('2024-01-15T18:00:00Z'));
    expect(isSessionExpired(session)).toBe(false);

    vi.setSystemTime(new Date('2024-01-16T00:00:00Z'));
    expect(isSessionExpired(session)).toBe(false);

    vi.setSystemTime(new Date('2024-01-16T11:59:59Z'));
    expect(isSessionExpired(session)).toBe(false);

    vi.setSystemTime(new Date('2024-01-16T12:00:00Z'));
    expect(isSessionExpired(session)).toBe(true);
  });
});

describe('integration: create and validate round-trip', () => {
  const SECRET = 'integration-test-secret';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates a freshly created cookie', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    const cookie = createSessionCookie(SECRET);
    const result = validateSessionCookie(cookie, SECRET);

    expect(result).not.toBeNull();
    expect(result?.iat).toBe(Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000));
    expect(result?.exp).toBe(Math.floor(new Date('2024-01-16T12:00:00Z').getTime() / 1000));
  });

  it('validates cookie throughout its validity period', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    const cookie = createSessionCookie(SECRET);

    // Check at various times during validity
    const checkTimes = [
      new Date('2024-01-15T12:00:01Z'), // 1 second after
      new Date('2024-01-15T18:00:00Z'), // 6 hours after
      new Date('2024-01-16T00:00:00Z'), // 12 hours after
      new Date('2024-01-16T11:59:59Z'), // 1 second before expiry
    ];

    for (const time of checkTimes) {
      vi.setSystemTime(time);
      const result = validateSessionCookie(cookie, SECRET);
      expect(result).not.toBeNull();
    }
  });

  it('rejects cookie after expiration', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    const cookie = createSessionCookie(SECRET);

    // Jump past expiration
    vi.setSystemTime(new Date('2024-01-16T12:00:01Z'));
    const result = validateSessionCookie(cookie, SECRET);

    expect(result).toBeNull();
  });
});

/**
 * Property-Based Tests for Session Validity
 *
 * **Validates: Requirements 2.2, 2.4, 2.5**
 *
 * Property 2: Session validity determines console access
 * - Access is granted if and only if the session cookie is present, correctly signed,
 *   and the current time is before the expiration timestamp (iat + 24 hours).
 */
import * as fc from 'fast-check';

describe('property: session validity determines console access', () => {
  const SECRET = 'property-test-secret';
  const SECONDS_IN_24H = 24 * 60 * 60;

  // Helper to create a session with specific iat and exp
  function createSessionWithTimestamps(iat: number, exp: number, secret: string): string {
    const payload = { iat, exp };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
    return `${payloadBase64}.${signature}`;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sessions where current time < exp should be valid (isSessionExpired returns false)', () => {
    fc.assert(
      fc.property(
        // Generate a base timestamp (Unix seconds, reasonable range)
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate an offset for current time before exp (1 second to 24h - 1 second)
        fc.integer({ min: 1, max: SECONDS_IN_24H - 1 }),
        (baseTime, offsetBeforeExp) => {
          const iat = baseTime;
          const exp = baseTime + SECONDS_IN_24H;
          const currentTime = exp - offsetBeforeExp; // currentTime < exp

          vi.setSystemTime(new Date(currentTime * 1000));

          const session: ConsoleSessionCookie = { iat, exp };
          const result = isSessionExpired(session);

          // When current time is before exp, session should NOT be expired
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sessions where current time >= exp should be expired (isSessionExpired returns true)', () => {
    fc.assert(
      fc.property(
        // Generate a base timestamp (Unix seconds, reasonable range)
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate an offset for current time at or after exp (0 to 7 days after)
        fc.integer({ min: 0, max: 7 * 24 * 60 * 60 }),
        (baseTime, offsetAfterExp) => {
          const iat = baseTime;
          const exp = baseTime + SECONDS_IN_24H;
          const currentTime = exp + offsetAfterExp; // currentTime >= exp

          vi.setSystemTime(new Date(currentTime * 1000));

          const session: ConsoleSessionCookie = { iat, exp };
          const result = isSessionExpired(session);

          // When current time is at or after exp, session should be expired
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('freshly created sessions are valid (validateSessionCookie returns non-null)', () => {
    fc.assert(
      fc.property(
        // Generate creation timestamp
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate a random secret string
        fc.string({ minLength: 8, maxLength: 64 }),
        (creationTime, secret) => {
          // Ensure secret is non-empty after potential whitespace
          const effectiveSecret = secret.trim() || 'fallback-secret';

          vi.setSystemTime(new Date(creationTime * 1000));

          const cookie = createSessionCookie(effectiveSecret);
          const result = validateSessionCookie(cookie, effectiveSecret);

          // Freshly created session should always be valid
          expect(result).not.toBeNull();
          expect(result?.iat).toBe(creationTime);
          expect(result?.exp).toBe(creationTime + SECONDS_IN_24H);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sessions with future iat but valid exp should still work', () => {
    fc.assert(
      fc.property(
        // Generate current time
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate how far in the future iat is (1 second to 1 hour)
        fc.integer({ min: 1, max: 3600 }),
        (currentTime, futureOffset) => {
          const iat = currentTime + futureOffset; // iat is in the future
          const exp = iat + SECONDS_IN_24H; // exp is 24h after iat

          vi.setSystemTime(new Date(currentTime * 1000));

          const cookie = createSessionWithTimestamps(iat, exp, SECRET);
          const result = validateSessionCookie(cookie, SECRET);

          // Session with future iat but valid exp (currentTime < exp) should be valid
          // Since currentTime < iat < exp, the session is not expired
          expect(result).not.toBeNull();
          expect(result?.iat).toBe(iat);
          expect(result?.exp).toBe(exp);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateSessionCookie agrees with isSessionExpired for any timestamp combination', () => {
    fc.assert(
      fc.property(
        // Generate iat timestamp
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate current time relative to iat (-1 day to +2 days)
        fc.integer({ min: -24 * 60 * 60, max: 2 * 24 * 60 * 60 }),
        (iat, currentTimeOffset) => {
          const exp = iat + SECONDS_IN_24H;
          const currentTime = iat + currentTimeOffset;

          vi.setSystemTime(new Date(currentTime * 1000));

          const cookie = createSessionWithTimestamps(iat, exp, SECRET);
          const validationResult = validateSessionCookie(cookie, SECRET);

          const session: ConsoleSessionCookie = { iat, exp };
          const isExpired = isSessionExpired(session);

          // validateSessionCookie returns null iff isSessionExpired returns true
          if (isExpired) {
            expect(validationResult).toBeNull();
          } else {
            expect(validationResult).not.toBeNull();
            expect(validationResult?.iat).toBe(iat);
            expect(validationResult?.exp).toBe(exp);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('session validity is absolute (24h from creation), not sliding', () => {
    fc.assert(
      fc.property(
        // Generate creation time
        fc.integer({ min: 1000000000, max: 2000000000 }),
        // Generate multiple check times as offsets from creation (0 to 48h)
        fc.array(fc.integer({ min: 0, max: 2 * SECONDS_IN_24H }), { minLength: 2, maxLength: 5 }),
        (creationTime, checkOffsets) => {
          const iat = creationTime;
          const exp = creationTime + SECONDS_IN_24H;
          const session: ConsoleSessionCookie = { iat, exp };

          // Regardless of how many times we check, expiry is always relative to original exp
          for (const offset of checkOffsets) {
            const checkTime = creationTime + offset;
            vi.setSystemTime(new Date(checkTime * 1000));

            const isExpired = isSessionExpired(session);
            const expectedExpired = checkTime >= exp;

            expect(isExpired).toBe(expectedExpired);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
