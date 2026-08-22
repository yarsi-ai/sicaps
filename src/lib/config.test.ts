import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getRiskLevel, CONFIG } from './config';

/**
 * **Validates: Requirements 4.1**
 *
 * Property 4: Risk level threshold correctness
 * For any non-negative integer totalScore, the risk level classification is
 * deterministic, exhaustive, and mutually exclusive.
 */
describe('getRiskLevel', () => {
  it('classifies scores 0-3 as LOW', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: CONFIG.riskThresholds.LOW_MAX }), (score) => {
        expect(getRiskLevel(score)).toBe('LOW');
      }),
    );
  });

  it('classifies scores 4-6 as MODERATE', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: CONFIG.riskThresholds.LOW_MAX + 1,
          max: CONFIG.riskThresholds.MODERATE_MAX,
        }),
        (score) => {
          expect(getRiskLevel(score)).toBe('MODERATE');
        },
      ),
    );
  });

  it('classifies scores >= 7 as HIGH', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: CONFIG.riskThresholds.MODERATE_MAX + 1, max: 1000 }),
        (score) => {
          expect(getRiskLevel(score)).toBe('HIGH');
        },
      ),
    );
  });

  it('produces exactly one classification for any non-negative integer', () => {
    fc.assert(
      fc.property(fc.nat(), (score) => {
        const result = getRiskLevel(score);
        const validLevels: string[] = ['LOW', 'MODERATE', 'HIGH'];
        expect(validLevels).toContain(result);
      }),
    );
  });
});

/**
 * The photo gate is mandatory and has no escape hatch other than uploading or
 * exhausting the client's retries, so the transport budget has to outlast that
 * retry budget. If it does not, a santri whose uploads keep dropping is refused
 * by the rate limiter before reaching the skip path, and the gate strands them.
 */
describe('CONFIG.rateLimit', () => {
  it('gives image uploads more attempts than the client will make on its own', () => {
    expect(CONFIG.rateLimit.image.maxRequests).toBeGreaterThan(
      CONFIG.visualDetection.MAX_UPLOAD_FAILURES,
    );
  });

  it('allows a chat turn budget that a full screening cannot exhaust in one window', () => {
    // Chips answers post through the same endpoint one tap at a time, so the
    // per-minute allowance has to sit above a realistic burst rather than near it.
    expect(CONFIG.rateLimit.chat.maxRequests).toBeGreaterThanOrEqual(30);
  });
});
