import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseChipsAnswer, LOKASI_KHAS } from './chips-handler';

/**
 * Property-based tests for chips handler lokasi classification.
 *
 * **Validates: Requirements 4.3, 4.4, 4.6**
 */

// Non-khas body locations for testing
const NON_KHAS_LOCATIONS = [
  'punggung',
  'kepala',
  'leher',
  'muka',
  'telapak kaki',
  'telapak tangan',
  'betis',
  'lengan atas',
];

describe('parseChipsAnswer lokasi properties', () => {
  /**
   * **Validates: Requirements 4.3, 4.6**
   *
   * Property 5: For any selection containing at least one LOKASI_KHAS item,
   * lokasiKhas is always true regardless of additional items.
   */
  it('Property 5: Any selection with at least one khas item → lokasiKhas true', () => {
    fc.assert(
      fc.property(
        fc.subarray(LOKASI_KHAS, { minLength: 1 }),
        fc.subarray(NON_KHAS_LOCATIONS),
        (khasItems, nonKhasItems) => {
          const selections = [...khasItems, ...nonKhasItems];
          const result = parseChipsAnswer({ type: 'lokasi', selections });
          expect(result.lokasiKhas).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * Property 6: For any selection containing only items NOT in LOKASI_KHAS
   * (and no Lainnya with khas text), lokasiKhas is always false.
   */
  it('Property 6: Selection with only non-khas items → lokasiKhas false', () => {
    fc.assert(
      fc.property(fc.subarray(NON_KHAS_LOCATIONS, { minLength: 1 }), (nonKhasItems) => {
        const result = parseChipsAnswer({ type: 'lokasi', selections: nonKhasItems });
        expect(result.lokasiKhas).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
