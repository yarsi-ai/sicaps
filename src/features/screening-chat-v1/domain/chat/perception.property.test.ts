import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildPerceptionInferenceContext } from './perception';
import type { Perception } from '../types';
import type { SupportedLocale } from '../config';

/**
 * Property-based tests for perception framing.
 *
 * **Validates: Requirements 6.6**
 */

const ALL_PERCEPTIONS: Perception[] = ['UNDERESTIMATE', 'OVERESTIMATE', 'BARRIER', 'ADEQUATE'];

const ALL_LOCALES: SupportedLocale[] = ['id', 'en'];

/** Arbitrary for a valid perception value */
const perceptionArb: fc.Arbitrary<Perception> = fc.constantFrom(...ALL_PERCEPTIONS);

/** Arbitrary for a valid locale value */
const localeArb: fc.Arbitrary<SupportedLocale> = fc.constantFrom(...ALL_LOCALES);

/**
 * Expected framing keyword per perception and locale.
 * UNDERESTIMATE → corrective/korektif
 * OVERESTIMATE → reassuring/menenangkan
 * BARRIER → barrier/hambatan
 * ADEQUATE → confirm/konfirmasi
 */
const EXPECTED_KEYWORDS: Record<Perception, Record<SupportedLocale, string>> = {
  UNDERESTIMATE: { en: 'corrective', id: 'korektif' },
  OVERESTIMATE: { en: 'reassuring', id: 'menenangkan' },
  BARRIER: { en: 'barrier', id: 'hambatan' },
  ADEQUATE: { en: 'confirm', id: 'konfirmasi' },
};

describe('Feature: ai-chat-bot, Property 10: Perception framing per category', () => {
  it('returns a non-empty string for any (perception, locale) pair', () => {
    fc.assert(
      fc.property(perceptionArb, localeArb, (perception, locale) => {
        const result = buildPerceptionInferenceContext(perception, locale);

        expect(typeof result).toBe('string');
        expect(result.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('returns a distinct string from all other perceptions in the same locale', () => {
    fc.assert(
      fc.property(perceptionArb, localeArb, (perception, locale) => {
        const result = buildPerceptionInferenceContext(perception, locale);

        const otherPerceptions = ALL_PERCEPTIONS.filter((p) => p !== perception);
        for (const other of otherPerceptions) {
          const otherResult = buildPerceptionInferenceContext(other, locale);
          expect(result).not.toBe(otherResult);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('contains the appropriate framing keyword for the perception type', () => {
    fc.assert(
      fc.property(perceptionArb, localeArb, (perception, locale) => {
        const result = buildPerceptionInferenceContext(perception, locale);
        const expectedKeyword = EXPECTED_KEYWORDS[perception][locale];

        expect(result.toLowerCase()).toContain(expectedKeyword);
      }),
      { numRuns: 100 },
    );
  });
});
