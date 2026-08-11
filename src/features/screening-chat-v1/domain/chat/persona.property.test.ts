import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { selectTheme } from './persona';
import type { EducationLevelInput } from '../types';

/**
 * Property-based tests for persona theme selection.
 *
 * Validates: Requirements 3.1, 3.2, 3.6
 */

/** All recognized education level values */
const ALL_EDUCATION_LEVELS: EducationLevelInput[] = ['elementary', 'junior_high', 'senior_high'];

/** Arbitrary for any valid EducationLevelInput */
const educationLevelArb: fc.Arbitrary<EducationLevelInput> = fc.constantFrom(
  ...ALL_EDUCATION_LEVELS,
);

/** Arbitrary for EducationLevelInput | undefined (full input domain) */
const educationLevelOrUndefinedArb: fc.Arbitrary<EducationLevelInput | undefined> = fc.oneof(
  educationLevelArb,
  fc.constant(undefined),
);

/** Non-elementary education levels */
const nonElementaryLevels: EducationLevelInput[] = ['junior_high', 'senior_high'];

const nonElementaryArb: fc.Arbitrary<EducationLevelInput> = fc.constantFrom(...nonElementaryLevels);

describe('Feature: ai-chat-bot, Property 7: Theme selection from education level', () => {
  it('selectTheme returns playful if and only if input is elementary', () => {
    fc.assert(
      fc.property(educationLevelOrUndefinedArb, (level) => {
        const result = selectTheme(level);

        if (level === 'elementary') {
          expect(result).toBe('playful');
        } else {
          expect(result).toBe('hybrid');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('selectTheme always returns playful for elementary', () => {
    fc.assert(
      fc.property(fc.constant('elementary' as EducationLevelInput), (level) => {
        expect(selectTheme(level)).toBe('playful');
      }),
      { numRuns: 100 },
    );
  });

  it('selectTheme always returns hybrid for non-elementary levels', () => {
    fc.assert(
      fc.property(nonElementaryArb, (level) => {
        expect(selectTheme(level)).toBe('hybrid');
      }),
      { numRuns: 100 },
    );
  });

  it('selectTheme returns hybrid for undefined', () => {
    fc.assert(
      fc.property(fc.constant(undefined), (level) => {
        expect(selectTheme(level)).toBe('hybrid');
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: screening-api, Property 8: Theme derivation determinism
describe('Feature: screening-api, Property 8: Theme derivation determinism', () => {
  /**
   * Validates: Requirements 1.4
   *
   * For any valid educationLevel value, the theme derivation SHALL map
   * "elementary" to "playful" and all other values ("junior_high", "senior_high")
   * to "hybrid", with no other outputs possible.
   */

  const validEducationLevels: EducationLevelInput[] = ['elementary', 'junior_high', 'senior_high'];

  const validEducationLevelArb: fc.Arbitrary<EducationLevelInput> = fc.constantFrom(
    ...validEducationLevels,
  );

  it('maps elementary to playful', () => {
    fc.assert(
      fc.property(fc.constant('elementary' as EducationLevelInput), (level) => {
        const theme = selectTheme(level);
        expect(theme).toBe('playful');
      }),
      { numRuns: 100 },
    );
  });

  it('maps junior_high and senior_high to hybrid', () => {
    const nonElementaryArb: fc.Arbitrary<EducationLevelInput> = fc.constantFrom(
      'junior_high' as EducationLevelInput,
      'senior_high' as EducationLevelInput,
    );

    fc.assert(
      fc.property(nonElementaryArb, (level) => {
        const theme = selectTheme(level);
        expect(theme).toBe('hybrid');
      }),
      { numRuns: 100 },
    );
  });

  it('only produces playful or hybrid for any valid education level', () => {
    fc.assert(
      fc.property(validEducationLevelArb, (level) => {
        const theme = selectTheme(level);
        expect(['playful', 'hybrid']).toContain(theme);
      }),
      { numRuns: 100 },
    );
  });
});
