import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mergeCoverage, type CoverageState, type DimensionExtraction } from './coverage';
import { ALL_DIMENSIONS } from '../types';

/**
 * Property-based tests for coverage module.
 *
 * **Validates: Requirements 3.3, 8.2**
 */

// --- Arbitraries ---

/** Arbitrary for a non-empty keyword string */
const keywordArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 20 });

/**
 * Arbitrary for a valid CoverageState where dimensiBelum + dimensiTerisi.keys = ALL_DIMENSIONS.
 * Generates a random subset of dimensions as "filled" with random keywords.
 */
const coverageStateArb: fc.Arbitrary<CoverageState> = fc.nat({ max: 6 }).chain((filledCount) => {
  return fc
    .shuffledSubarray([...ALL_DIMENSIONS], {
      minLength: filledCount,
      maxLength: filledCount,
    })
    .chain((filled) => {
      const belum = ALL_DIMENSIONS.filter((d) => !filled.includes(d));

      if (filled.length === 0) {
        return fc.constant<CoverageState>({
          dimensiTerisi: {},
          dimensiBelum: belum,
        });
      }

      // Generate keywords for each filled dimension
      return fc
        .tuple(
          ...filled.map(() =>
            fc.tuple(
              fc.array(keywordArb, { minLength: 1, maxLength: 4 }),
              fc.array(keywordArb, { minLength: 0, maxLength: 2 }),
            ),
          ),
        )
        .map((keywordPairs) => {
          const dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }> = {};
          filled.forEach((d, i) => {
            const [keywords, negasi] = keywordPairs[i]!;
            dimensiTerisi[d] = { keywords, negasi };
          });
          return { dimensiTerisi, dimensiBelum: belum };
        });
    });
});

/**
 * Arbitrary for a DimensionExtraction targeting 1-3 dimensions with new keywords.
 */
const extractionArb: fc.Arbitrary<DimensionExtraction> = fc
  .shuffledSubarray([...ALL_DIMENSIONS], { minLength: 1, maxLength: 3 })
  .chain((dims) => {
    return fc
      .tuple(
        ...dims.map(() =>
          fc.tuple(
            fc.array(keywordArb, { minLength: 1, maxLength: 3 }),
            fc.array(keywordArb, { minLength: 0, maxLength: 2 }),
          ),
        ),
      )
      .map((pairs) => {
        const dimensi: Record<string, { keywords: string[]; negasi?: string[] }> = {};
        dims.forEach((d, i) => {
          const [keywords, negasi] = pairs[i]!;
          dimensi[d] = negasi.length > 0 ? { keywords, negasi } : { keywords };
        });
        return { dimensi } as DimensionExtraction;
      });
  });

// --- Property 5: Append-Only Coverage ---

describe('Property 5: Append-Only Coverage', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * For any call to mergeCoverage(state, extraction), keywords present in the
   * input state.dimensiTerisi SHALL still be present in the output state
   * (no silent removal without correction).
   */

  it('existing keywords in dimensiTerisi are never removed by mergeCoverage', () => {
    fc.assert(
      fc.property(coverageStateArb, extractionArb, (state, extraction) => {
        const result = mergeCoverage(state, extraction);

        // For every dimension that had keywords before merge,
        // ALL those keywords must still be present in the output
        for (const [dimensi, data] of Object.entries(state.dimensiTerisi)) {
          const outputDimension = result.dimensiTerisi[dimensi];

          // Dimension must still exist in output
          expect(outputDimension).toBeDefined();

          // Every keyword from the original state must still be present
          for (const keyword of data.keywords) {
            expect(outputDimension!.keywords).toContain(keyword);
          }

          // Every negasi from the original state must still be present
          for (const negasi of data.negasi) {
            expect(outputDimension!.negasi).toContain(negasi);
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it('merge only adds — output keywords is a superset of input keywords', () => {
    fc.assert(
      fc.property(coverageStateArb, extractionArb, (state, extraction) => {
        const result = mergeCoverage(state, extraction);

        // For each dimension in the original state, the output keyword set
        // must be a superset of the input keyword set
        for (const [dimensi, data] of Object.entries(state.dimensiTerisi)) {
          const outputKeywords = new Set(result.dimensiTerisi[dimensi]?.keywords ?? []);
          const outputNegasi = new Set(result.dimensiTerisi[dimensi]?.negasi ?? []);

          for (const kw of data.keywords) {
            expect(outputKeywords.has(kw)).toBe(true);
          }
          for (const neg of data.negasi) {
            expect(outputNegasi.has(neg)).toBe(true);
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});

// --- Property 6: Coverage Dimension Completeness ---

describe('Property 6: Coverage Dimension Completeness', () => {
  /**
   * **Validates: Requirements 3.3, 8.2**
   *
   * For any CoverageState, dimensiBelum.length + Object.keys(dimensiTerisi).length
   * SHALL always equal 6 (ALL_DIMENSIONS.length).
   */

  it('dimensiBelum.length + dimensiTerisi keys always equals 6 after mergeCoverage', () => {
    fc.assert(
      fc.property(coverageStateArb, extractionArb, (state, extraction) => {
        const result = mergeCoverage(state, extraction);

        const terisiCount = Object.keys(result.dimensiTerisi).length;
        const belumCount = result.dimensiBelum.length;

        expect(terisiCount + belumCount).toBe(ALL_DIMENSIONS.length);
      }),
      { numRuns: 150 },
    );
  });

  it('no dimension appears in both dimensiBelum and dimensiTerisi after merge', () => {
    fc.assert(
      fc.property(coverageStateArb, extractionArb, (state, extraction) => {
        const result = mergeCoverage(state, extraction);

        const terisiKeys = new Set(Object.keys(result.dimensiTerisi));
        const belumSet = new Set(result.dimensiBelum);

        // No overlap between the two sets
        for (const key of terisiKeys) {
          expect(belumSet.has(key)).toBe(false);
        }
        for (const dim of belumSet) {
          expect(terisiKeys.has(dim)).toBe(false);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('all dimensions in the output are valid DimensionName values', () => {
    fc.assert(
      fc.property(coverageStateArb, extractionArb, (state, extraction) => {
        const result = mergeCoverage(state, extraction);

        const validDimensions = new Set<string>(ALL_DIMENSIONS);

        for (const key of Object.keys(result.dimensiTerisi)) {
          expect(validDimensions.has(key)).toBe(true);
        }
        for (const dim of result.dimensiBelum) {
          expect(validDimensions.has(dim)).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });
});
