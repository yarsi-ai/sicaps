import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateCategoryScore, calculateAllScores } from './engine';
import { PATTERN_TABLE_ID } from '../keywords/id';
import { buildPoolEntry, buildKeywordPool } from '../../../../../__test-utils__/factories/scoring';
import type {
  PoolEntry,
  KeywordRule,
  KeywordPool,
  Confidence,
  CategoryName,
} from '../keywords/types';

import combinedFixtures from '../../../../../__test-utils__/fixtures/scoring/combined.json';

// Types for combined fixture data
interface FixtureScoreExpected {
  raw: number;
  capped: number;
}

interface CombinedFixture {
  name: string;
  locale: 'id' | 'en';
  pool: KeywordPool;
  expected: {
    totalScore: number;
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    scores: Record<CategoryName, FixtureScoreExpected>;
  };
}

// Arbitraries for property-based tests
const confidenceArb = fc.constantFrom<Confidence>('high', 'medium', 'low');

const poolEntryArb = fc.record({
  keyword: fc.constantFrom(
    'gatal banget',
    'ga tahan',
    'ganggu tidur',
    'malam',
    'makin parah malam',
    'sela jari',
    'temen sekamar',
    'bintil kecil',
    'pondok',
    'bentol',
    'pergelangan',
    'banyak yang gatal',
    'tukeran handuk',
    'ga gatal',
    'sendiri',
    'kulit normal',
    'unknown keyword',
  ),
  confidence: confidenceArb,
  turn: fc.integer({ min: 1, max: 7 }),
  matched: fc.constant(false),
  matchedPattern: fc.constant(null),
});

const categoryNameArb = fc.constantFrom<CategoryName>(
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
);

const keywordPoolArb = fc.record({
  intensitas: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
  waktu: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
  lokasi_tubuh: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
  kontak: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
  lesi: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
  faktor_risiko: fc.array(poolEntryArb, { minLength: 0, maxLength: 5 }),
}) as fc.Arbitrary<KeywordPool>;

describe('calculateCategoryScore', () => {
  describe('unit tests', () => {
    it('returns raw, capped, matchedPatterns, and unmatchedKeywords', () => {
      const entries = [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result).toHaveProperty('raw');
      expect(result).toHaveProperty('capped');
      expect(result).toHaveProperty('matchedPatterns');
      expect(result).toHaveProperty('unmatchedKeywords');
      expect(result.raw).toBe(1);
      expect(result.capped).toBe(1);
      expect(result.matchedPatterns).toContain('gatal banget');
      expect(result.unmatchedKeywords).toHaveLength(0);
    });

    it('applies floor zero — negative raw score capped to 0', () => {
      const entries = [buildPoolEntry({ keyword: 'ga gatal', confidence: 'high', turn: 1 })];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.raw).toBe(-2);
      expect(result.capped).toBe(0);
    });

    it('returns status "assessed" when pool has entries with confidence >= medium', () => {
      const entries = [buildPoolEntry({ keyword: 'gatal banget', confidence: 'medium', turn: 1 })];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.status).toBe('assessed');
    });

    it('returns status "not_assessed" when pool is empty', () => {
      const entries: PoolEntry[] = [];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.status).toBe('not_assessed');
    });

    it('returns status "not_assessed" when pool only has low confidence entries', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'low', turn: 1 }),
        buildPoolEntry({ keyword: 'ga tahan', confidence: 'low', turn: 2 }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.status).toBe('not_assessed');
      expect(result.raw).toBe(0);
      expect(result.capped).toBe(0);
    });

    it('sums multiple matched pattern scores', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 }),
        buildPoolEntry({ keyword: 'ganggu tidur', confidence: 'high', turn: 1 }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.raw).toBe(2);
      expect(result.capped).toBe(2);
      expect(result.matchedPatterns).toContain('gatal banget');
      expect(result.matchedPatterns).toContain('ganggu tidur');
    });

    it('collects unmatched keywords (confidence >= medium, no pattern match)', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 }),
        buildPoolEntry({ keyword: 'kata yang tidak dikenal', confidence: 'medium', turn: 2 }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = calculateCategoryScore(entries, positiveRules, negativeRules);

      expect(result.unmatchedKeywords).toContain('kata yang tidak dikenal');
    });
  });

  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 6.2**
     * P2: ∀ cat: categoryScore.capped >= 0 (score non-negativity)
     */
    it('P2: capped score is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.array(poolEntryArb, { minLength: 0, maxLength: 8 }),
          categoryNameArb,
          (entries, category) => {
            const positiveRules = PATTERN_TABLE_ID.positive[category] as KeywordRule[];
            const negativeRules = ((
              PATTERN_TABLE_ID.negative as Partial<Record<CategoryName, readonly KeywordRule[]>>
            )[category] ?? []) as KeywordRule[];

            const result = calculateCategoryScore(
              entries as PoolEntry[],
              positiveRules,
              negativeRules,
            );

            expect(result.capped).toBeGreaterThanOrEqual(0);
          },
        ),
      );
    });
  });
});

describe('calculateAllScores', () => {
  describe('fixture-based tests', () => {
    it.each(combinedFixtures as CombinedFixture[])('$name', (fixture) => {
      const result = calculateAllScores(fixture.pool, fixture.locale);

      expect(result.totalScore).toBe(fixture.expected.totalScore);
      expect(result.riskLevel).toBe(fixture.expected.riskLevel);

      for (const cat of Object.keys(fixture.expected.scores) as CategoryName[]) {
        expect(result.scores[cat].raw).toBe(fixture.expected.scores[cat].raw);
        expect(result.scores[cat].capped).toBe(fixture.expected.scores[cat].capped);
      }
    });
  });

  describe('unit tests', () => {
    it('sums all capped category scores into totalScore', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })],
        waktu: [buildPoolEntry({ keyword: 'makin parah malam', confidence: 'high', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'id');

      // intensitas capped: 1, waktu capped: 2, rest: 0
      expect(result.totalScore).toBe(3);
    });

    it('assigns risk level LOW for totalScore <= 3', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'id');

      expect(result.totalScore).toBeLessThanOrEqual(3);
      expect(result.riskLevel).toBe('LOW');
    });

    it('assigns risk level MODERATE for totalScore 4-6', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })],
        waktu: [buildPoolEntry({ keyword: 'makin parah malam', confidence: 'high', turn: 1 })],
        lokasi_tubuh: [buildPoolEntry({ keyword: 'sela jari', confidence: 'high', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'id');

      // 1 + 2 + 2 = 5
      expect(result.totalScore).toBe(5);
      expect(result.riskLevel).toBe('MODERATE');
    });

    it('assigns risk level HIGH for totalScore >= 7', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })],
        waktu: [buildPoolEntry({ keyword: 'makin parah malam', confidence: 'high', turn: 1 })],
        lokasi_tubuh: [buildPoolEntry({ keyword: 'sela jari', confidence: 'high', turn: 1 })],
        kontak: [
          buildPoolEntry({ keyword: 'temen sekamar', confidence: 'high', turn: 2 }),
          buildPoolEntry({ keyword: 'banyak yang gatal', confidence: 'high', turn: 2 }),
        ],
      });

      const result = calculateAllScores(pool, 'id');

      // 1 + 2 + 2 + 4 = 9
      expect(result.totalScore).toBe(9);
      expect(result.riskLevel).toBe('HIGH');
    });

    it('sets category status "assessed" when pool has entries with confidence >= medium', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'medium', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'id');

      expect(result.scores.intensitas.status).toBe('assessed');
    });

    it('sets category status "not_assessed" when pool is empty', () => {
      const pool = buildKeywordPool();

      const result = calculateAllScores(pool, 'id');

      expect(result.scores.intensitas.status).toBe('not_assessed');
      expect(result.scores.waktu.status).toBe('not_assessed');
      expect(result.scores.kontak.status).toBe('not_assessed');
    });

    it('sets category status "not_assessed" when pool only has low confidence entries', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'low', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'id');

      expect(result.scores.intensitas.status).toBe('not_assessed');
    });

    it('sets scoring version to "v1"', () => {
      const pool = buildKeywordPool();

      const result = calculateAllScores(pool, 'id');

      expect(result.version).toBe('v1');
    });

    it('uses English pattern table when locale is "en"', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'very itchy', confidence: 'high', turn: 1 })],
        waktu: [buildPoolEntry({ keyword: 'worse at night', confidence: 'high', turn: 1 })],
      });

      const result = calculateAllScores(pool, 'en');

      expect(result.scores.intensitas.capped).toBe(1);
      expect(result.scores.waktu.capped).toBe(2);
      expect(result.totalScore).toBe(3);
    });

    it('returns all zeros for empty pool', () => {
      const pool = buildKeywordPool();

      const result = calculateAllScores(pool, 'id');

      expect(result.totalScore).toBe(0);
      expect(result.riskLevel).toBe('LOW');
      for (const cat of Object.keys(result.scores) as CategoryName[]) {
        expect(result.scores[cat].raw).toBe(0);
        expect(result.scores[cat].capped).toBe(0);
      }
    });
  });

  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 6.3**
     * P3: totalScore === Σ(scores[cat].capped) (total consistency)
     */
    it('P3: totalScore equals sum of all capped category scores', () => {
      fc.assert(
        fc.property(keywordPoolArb, (pool) => {
          const result = calculateAllScores(pool, 'id');

          const sumCapped = Object.values(result.scores).reduce((sum, cat) => sum + cat.capped, 0);
          expect(result.totalScore).toBe(sumCapped);
        }),
      );
    });

    /**
     * **Validates: Requirements 6.4, 6.5, 6.6**
     * P4: risk level is monotonic — higher total never gets lower risk level
     */
    it('P4: risk level is monotonic with respect to total score', () => {
      const riskOrder = { LOW: 0, MODERATE: 1, HIGH: 2 } as const;

      fc.assert(
        fc.property(keywordPoolArb, keywordPoolArb, (poolA, poolB) => {
          const resultA = calculateAllScores(poolA, 'id');
          const resultB = calculateAllScores(poolB, 'id');

          if (resultA.totalScore >= resultB.totalScore) {
            expect(riskOrder[resultA.riskLevel]).toBeGreaterThanOrEqual(
              riskOrder[resultB.riskLevel],
            );
          }
          if (resultB.totalScore >= resultA.totalScore) {
            expect(riskOrder[resultB.riskLevel]).toBeGreaterThanOrEqual(
              riskOrder[resultA.riskLevel],
            );
          }
        }),
      );
    });

    /**
     * **Validates: Requirements 6.2**
     * P2 (full): all category capped scores are non-negative across all categories
     */
    it('P2: all capped category scores are non-negative', () => {
      fc.assert(
        fc.property(keywordPoolArb, (pool) => {
          const result = calculateAllScores(pool, 'id');

          for (const cat of Object.keys(result.scores) as CategoryName[]) {
            expect(result.scores[cat].capped).toBeGreaterThanOrEqual(0);
          }
        }),
      );
    });
  });

  describe('worked examples — SCORING_ENGINE_SPEC §14', () => {
    it('§14.1 Turn 2 — intensitas + waktu + lokasi = total 5, MODERATE', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 2 })],
        waktu: [buildPoolEntry({ keyword: 'makin parah malam', confidence: 'high', turn: 2 })],
        lokasi_tubuh: [buildPoolEntry({ keyword: 'sela jari', confidence: 'high', turn: 2 })],
      });

      const result = calculateAllScores(pool, 'id');

      expect(result.scores.intensitas.capped).toBe(1);
      expect(result.scores.waktu.capped).toBe(2);
      expect(result.scores.lokasi_tubuh.capped).toBe(2);
      expect(result.totalScore).toBe(5);
      expect(result.riskLevel).toBe('MODERATE');
    });

    it('§14.1 Turn 3 — adds kontak (temen sekamar + banyak yang gatal) = total 9, HIGH', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 2 })],
        waktu: [buildPoolEntry({ keyword: 'makin parah malam', confidence: 'high', turn: 2 })],
        lokasi_tubuh: [buildPoolEntry({ keyword: 'sela jari', confidence: 'high', turn: 2 })],
        kontak: [
          buildPoolEntry({ keyword: 'temen sekamar', confidence: 'high', turn: 3 }),
          buildPoolEntry({ keyword: 'banyak yang gatal', confidence: 'high', turn: 3 }),
        ],
      });

      const result = calculateAllScores(pool, 'id');

      expect(result.scores.kontak.raw).toBe(4);
      expect(result.scores.kontak.capped).toBe(4);
      expect(result.totalScore).toBe(9);
      expect(result.riskLevel).toBe('HIGH');
    });

    it('§14.2 Longest match priority — "gatal banget" blocks shorter "gatal"', () => {
      const pool = buildKeywordPool({
        intensitas: [
          buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 2 }),
          buildPoolEntry({ keyword: 'gatal', confidence: 'high', turn: 2 }),
        ],
      });

      const result = calculateAllScores(pool, 'id');

      // "gatal banget" matches (1), "gatal" blocked → total intensitas = 1
      expect(result.scores.intensitas.raw).toBe(1);
      expect(result.scores.intensitas.capped).toBe(1);
    });

    it('§14.3 Negative keyword cancellation — kontak floors to 0', () => {
      const pool = buildKeywordPool({
        kontak: [
          buildPoolEntry({ keyword: 'teman sekamar', confidence: 'high', turn: 2 }),
          buildPoolEntry({ keyword: 'sendiri', confidence: 'high', turn: 5 }),
        ],
      });

      const result = calculateAllScores(pool, 'id');

      // "teman sekamar" matches "teman sekamar" (+2), "sendiri" matches negative "sendiri" (-2)
      // raw = 0, capped = 0
      expect(result.scores.kontak.raw).toBe(0);
      expect(result.scores.kontak.capped).toBe(0);
    });

    it('§14.4 Confidence filtering — low confidence keyword excluded, high included after upgrade', () => {
      const pool = buildKeywordPool({
        waktu: [
          // After uniqueness: same keyword keeps highest confidence = high
          buildPoolEntry({ keyword: 'malam', confidence: 'high', turn: 3 }),
        ],
      });

      const result = calculateAllScores(pool, 'id');

      // "malam" (high) → eligible → match "malam" (2)
      expect(result.scores.waktu.raw).toBe(2);
      expect(result.scores.waktu.capped).toBe(2);
    });
  });
});
