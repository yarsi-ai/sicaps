import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculatePillScore } from './scorer';
import { getPillById } from './pills';
import { appendToPool } from '../../domain/scoring/pool';
import { buildKeywordPool } from '../../../../../__test-utils__/factories/scoring';
import type { CategoryName, PillSelection, CategoryExtraction } from '../../domain/keywords/types';

const ALL_CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

// Valid pill IDs from the definitions (multi-select categories allow multiple selections)
const VALID_PILL_IDS_ID: Record<CategoryName, string[]> = {
  intensitas: ['int_severe', 'int_scratch', 'int_sleep', 'int_wound', 'int_mild', 'int_none'],
  waktu: [
    'waktu_night',
    'waktu_worse_night',
    'waktu_bedtime',
    'waktu_day_better',
    'waktu_all_day',
    'waktu_day_only',
  ],
  lokasi_tubuh: ['lok_finger_webs', 'lok_genital', 'lok_body_parts', 'lok_whole_body'],
  kontak: ['kontak_roommate', 'kontak_housemate', 'kontak_many', 'kontak_bed', 'kontak_alone'],
  lesi: [
    'lesi_papules',
    'lesi_welts',
    'lesi_redness',
    'lesi_wounds',
    'lesi_lines',
    'lesi_bites',
    'lesi_dry',
    'lesi_normal',
  ],
  faktor_risiko: [
    'risiko_boarding',
    'risiko_crowded',
    'risiko_sharing_clothes',
    'risiko_sharing_bed',
    'risiko_hygiene',
  ],
};

// Arbitrary for valid pill selections
const pillSelectionArb = fc.oneof(
  ...ALL_CATEGORIES.map((category) =>
    fc.constantFrom(...VALID_PILL_IDS_ID[category]).map((pillId) => ({
      pillId,
      category,
    })),
  ),
) as fc.Arbitrary<PillSelection>;

describe('calculatePillScore', () => {
  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 6.9**
     * P9: pill scores do not affect keyword pool — operations are independent
     */
    it('P9: pill scores do not affect keyword pool (operations independent)', () => {
      fc.assert(
        fc.property(fc.array(pillSelectionArb, { minLength: 1, maxLength: 6 }), (selections) => {
          const poolBefore = buildKeywordPool();

          // Calculate pill score (should NOT touch the pool)
          calculatePillScore(selections, 'id');

          // Append to pool after pill calculation
          const extraction: CategoryExtraction = {
            intensitas: [{ keyword: 'gatal banget', confidence: 'high' }],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          };
          const poolAfterWithPill = appendToPool(poolBefore, extraction, 1);

          // Append to pool without pill calculation
          const poolAfterWithoutPill = appendToPool(buildKeywordPool(), extraction, 1);

          // Pool result should be identical regardless of pill calculation
          expect(poolAfterWithPill).toEqual(poolAfterWithoutPill);
        }),
      );
    });

    /**
     * **Validates: Requirements 6.10**
     * P10: ∀ cat: scores[cat].capped >= 0 (floor zero for pill scoring)
     */
    it('P10: all capped category scores are non-negative (floor zero)', () => {
      fc.assert(
        fc.property(fc.array(pillSelectionArb, { minLength: 1, maxLength: 10 }), (selections) => {
          const result = calculatePillScore(selections, 'id');

          for (const cat of ALL_CATEGORIES) {
            expect(result.scores[cat].capped).toBeGreaterThanOrEqual(0);
          }
        }),
      );
    });
  });

  describe('unit tests', () => {
    it('single-select category uses score of selected pill', () => {
      const selections: PillSelection[] = [{ pillId: 'int_severe', category: 'intensitas' }];

      const result = calculatePillScore(selections, 'id');

      const pill = getPillById('id', 'int_severe');
      expect(result.scores.intensitas.raw).toBe(pill!.score);
      expect(result.scores.intensitas.capped).toBe(pill!.score);
    });

    it('multi-select category sums scores of all selected pills', () => {
      const selections: PillSelection[] = [
        { pillId: 'lok_finger_webs', category: 'lokasi_tubuh' },
        { pillId: 'lok_genital', category: 'lokasi_tubuh' },
        { pillId: 'lok_body_parts', category: 'lokasi_tubuh' },
      ];

      const result = calculatePillScore(selections, 'id');

      // lok_finger_webs (2) + lok_genital (2) + lok_body_parts (1) = 5
      expect(result.scores.lokasi_tubuh.raw).toBe(5);
      expect(result.scores.lokasi_tubuh.capped).toBe(5);
    });

    it('negative pill reduces category score', () => {
      const selections: PillSelection[] = [
        { pillId: 'kontak_roommate', category: 'kontak' },
        { pillId: 'kontak_alone', category: 'kontak' },
      ];

      const result = calculatePillScore(selections, 'id');

      // kontak_roommate (2) + kontak_alone (-2) = 0
      expect(result.scores.kontak.raw).toBe(0);
      expect(result.scores.kontak.capped).toBe(0);
    });

    it('floor zero applied per category (negative pill cannot make score < 0)', () => {
      const selections: PillSelection[] = [{ pillId: 'int_none', category: 'intensitas' }];

      const result = calculatePillScore(selections, 'id');

      // int_none score is -2, floor applied → capped 0
      expect(result.scores.intensitas.raw).toBe(-2);
      expect(result.scores.intensitas.capped).toBe(0);
    });

    it('same risk level thresholds as chat mode (≤3 LOW, 4-6 MODERATE, ≥7 HIGH)', () => {
      // LOW: total ≤ 3
      const lowSelections: PillSelection[] = [
        { pillId: 'int_severe', category: 'intensitas' }, // 1
      ];
      expect(calculatePillScore(lowSelections, 'id').riskLevel).toBe('LOW');

      // MODERATE: total 4-6
      const modSelections: PillSelection[] = [
        { pillId: 'lok_finger_webs', category: 'lokasi_tubuh' }, // 2
        { pillId: 'lok_genital', category: 'lokasi_tubuh' }, // 2
      ];
      expect(calculatePillScore(modSelections, 'id').riskLevel).toBe('MODERATE');

      // HIGH: total ≥ 7
      const highSelections: PillSelection[] = [
        { pillId: 'waktu_night', category: 'waktu' }, // 2
        { pillId: 'lok_finger_webs', category: 'lokasi_tubuh' }, // 2
        { pillId: 'lok_genital', category: 'lokasi_tubuh' }, // 2
        { pillId: 'kontak_roommate', category: 'kontak' }, // 2
      ];
      expect(calculatePillScore(highSelections, 'id').riskLevel).toBe('HIGH');
    });

    it('invalid pill ID throws ValidationError', () => {
      const selections: PillSelection[] = [
        { pillId: 'nonexistent_pill_id', category: 'intensitas' },
      ];

      expect(() => calculatePillScore(selections, 'id')).toThrow('Invalid pill ID');
    });

    it('categories with no selections are marked "not_assessed"', () => {
      const selections: PillSelection[] = [{ pillId: 'int_severe', category: 'intensitas' }];

      const result = calculatePillScore(selections, 'id');

      expect(result.scores.intensitas.status).toBe('assessed');
      expect(result.scores.waktu.status).toBe('not_assessed');
      expect(result.scores.lokasi_tubuh.status).toBe('not_assessed');
      expect(result.scores.kontak.status).toBe('not_assessed');
      expect(result.scores.lesi.status).toBe('not_assessed');
      expect(result.scores.faktor_risiko.status).toBe('not_assessed');
    });

    it('sets version to "v1"', () => {
      const selections: PillSelection[] = [{ pillId: 'int_severe', category: 'intensitas' }];

      const result = calculatePillScore(selections, 'id');

      expect(result.version).toBe('v1');
    });

    it('works with English locale', () => {
      const selections: PillSelection[] = [
        { pillId: 'int_severe', category: 'intensitas' },
        { pillId: 'waktu_night', category: 'waktu' },
      ];

      const result = calculatePillScore(selections, 'en');

      expect(result.scores.intensitas.capped).toBe(1);
      expect(result.scores.waktu.capped).toBe(2);
      expect(result.totalScore).toBe(3);
      expect(result.riskLevel).toBe('LOW');
    });

    it('computes total as sum of all capped category scores', () => {
      const selections: PillSelection[] = [
        { pillId: 'int_severe', category: 'intensitas' }, // 1
        { pillId: 'waktu_night', category: 'waktu' }, // 2
        { pillId: 'lok_finger_webs', category: 'lokasi_tubuh' }, // 2
      ];

      const result = calculatePillScore(selections, 'id');

      expect(result.totalScore).toBe(1 + 2 + 2);
    });
  });
});
