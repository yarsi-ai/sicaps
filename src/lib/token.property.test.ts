import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { verifyShareToken } from './token';

/**
 * Property-based tests for timing-safe token comparison.
 *
 * Validates: Requirements 12.5
 */

// Feature: screening-api, Property 7: Timing-safe token comparison correctness
describe('Feature: screening-api, Property 7: Timing-safe token comparison correctness', () => {
  it('returns true when both strings are identical', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (str) => {
        expect(verifyShareToken(str, str)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns false when strings differ', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (a, b) => {
          fc.pre(a !== b);
          expect(verifyShareToken(a, b)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns false when strings have different lengths', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (a, b) => {
          fc.pre(a.length !== b.length);
          expect(verifyShareToken(a, b)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns false when one string is a prefix of the other', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (base, suffix) => {
          const longer = base + suffix;
          expect(verifyShareToken(base, longer)).toBe(false);
          expect(verifyShareToken(longer, base)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns false for single-character differences', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 2, maxLength: 80 }), fc.nat(), (str, rawIdx) => {
        const idx = rawIdx % str.length;
        const original = str.charCodeAt(idx);
        // Flip one character to a different value
        const flipped = original === 0x61 ? 0x62 : 0x61; // 'a' ↔ 'b'
        const modified = str.slice(0, idx) + String.fromCharCode(flipped) + str.slice(idx + 1);
        fc.pre(str !== modified);
        expect(verifyShareToken(str, modified)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
