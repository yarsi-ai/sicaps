import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { matchKeywords } from './matcher';
import { buildPoolEntry } from '../../../../../__test-utils__/factories/scoring';
import { PATTERN_TABLE_ID } from '../keywords/id';
import { PATTERN_TABLE_EN } from '../keywords/en';
import type { PoolEntry, KeywordRule, Confidence, CategoryName } from '../keywords/types';

import intensitasFixtures from '../../../../../__test-utils__/fixtures/scoring/intensitas.json';
import waktuFixtures from '../../../../../__test-utils__/fixtures/scoring/waktu.json';
import lokasiTubuhFixtures from '../../../../../__test-utils__/fixtures/scoring/lokasi_tubuh.json';
import kontakFixtures from '../../../../../__test-utils__/fixtures/scoring/kontak.json';
import lesiFixtures from '../../../../../__test-utils__/fixtures/scoring/lesi.json';
import faktorRisikoFixtures from '../../../../../__test-utils__/fixtures/scoring/faktor_risiko.json';
import negativeFixtures from '../../../../../__test-utils__/fixtures/scoring/negative.json';

// Types for fixture data
interface FixtureInput {
  keyword: string;
  confidence: Confidence;
}

interface FixtureExpected {
  score: number;
  matchedPatterns: string[];
}

interface Fixture {
  name: string;
  locale: 'id' | 'en';
  category: CategoryName;
  input: FixtureInput[];
  expected: FixtureExpected;
}

// Helper: convert fixture input to PoolEntry[]
function fixtureToEntries(input: FixtureInput[], turn = 1): PoolEntry[] {
  return input.map((item) =>
    buildPoolEntry({
      keyword: item.keyword,
      confidence: item.confidence,
      turn,
    }),
  );
}

// Helper: get rules for a fixture
function getRulesForFixture(fixture: Fixture): {
  positive: KeywordRule[];
  negative: KeywordRule[];
} {
  const table = fixture.locale === 'id' ? PATTERN_TABLE_ID : PATTERN_TABLE_EN;
  const positive = table.positive[fixture.category] as KeywordRule[];
  const negative = ((table.negative as Partial<Record<CategoryName, readonly KeywordRule[]>>)[
    fixture.category
  ] ?? []) as KeywordRule[];
  return { positive, negative };
}

// Arbitraries for property-based tests
const confidenceArb = fc.constantFrom<Confidence>('high', 'medium', 'low');
const keywordArb = fc.string({ minLength: 1, maxLength: 50 });

const poolEntryArb = fc.record({
  keyword: keywordArb,
  confidence: confidenceArb,
  turn: fc.integer({ min: 1, max: 10 }),
  matched: fc.constant(false),
  matchedPattern: fc.constant(null),
});

describe('matchKeywords', () => {
  describe('fixture-based tests — intensitas', () => {
    it.each(intensitasFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — waktu', () => {
    it.each(waktuFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — lokasi_tubuh', () => {
    it.each(lokasiTubuhFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — kontak', () => {
    it.each(kontakFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — lesi', () => {
    it.each(lesiFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — faktor_risiko', () => {
    it.each(faktorRisikoFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('fixture-based tests — negative patterns', () => {
    it.each(negativeFixtures as Fixture[])('$name', (fixture) => {
      const entries = fixtureToEntries(fixture.input);
      const { positive, negative } = getRulesForFixture(fixture);

      const result = matchKeywords(entries, positive, negative);

      expect(result.score).toBe(fixture.expected.score);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(fixture.expected.matchedPatterns),
      );
      expect(result.matchedPatterns).toHaveLength(fixture.expected.matchedPatterns.length);
    });
  });

  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 5.4**
     * P6: matchedPatterns has no duplicates (pattern exclusivity).
     */
    it('P6: matchedPatterns contains no duplicate entries', () => {
      fc.assert(
        fc.property(fc.array(poolEntryArb, { minLength: 1, maxLength: 10 }), (entries) => {
          const result = matchKeywords(
            entries as PoolEntry[],
            PATTERN_TABLE_ID.positive.intensitas as KeywordRule[],
            (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[],
          );

          const unique = new Set(result.matchedPatterns);
          expect(unique.size).toBe(result.matchedPatterns.length);
        }),
      );
    });

    /**
     * **Validates: Requirements 4.3**
     * P7: no keyword with confidence "low" contributes to score.
     */
    it('P7: keywords with confidence "low" do not contribute to score', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              keyword: fc.constantFrom(
                'gatal banget',
                'ga tahan',
                'ganggu tidur',
                'parah',
                'garuk terus',
              ),
              confidence: fc.constant<Confidence>('low'),
              turn: fc.integer({ min: 1, max: 10 }),
              matched: fc.constant(false),
              matchedPattern: fc.constant(null),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (entries) => {
            const result = matchKeywords(
              entries as PoolEntry[],
              PATTERN_TABLE_ID.positive.intensitas as KeywordRule[],
              (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[],
            );

            expect(result.score).toBe(0);
            expect(result.matchedPatterns).toHaveLength(0);
          },
        ),
      );
    });
  });

  describe('edge cases', () => {
    it('substring match works — "gatal banget" matches pattern "gatal banget"', () => {
      const entries = [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high' })];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      expect(result.score).toBe(1);
      expect(result.matchedPatterns).toContain('gatal banget');
    });

    it('longest-match priority — "gatal banget" blocks shorter "gatal" from matching separately', () => {
      // If "gatal banget" is matched, the shorter pattern "gatal" (which is a substring
      // of "gatal banget") should be blocked for other keywords
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'high' }),
        buildPoolEntry({ keyword: 'gatal', confidence: 'high' }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      // "gatal banget" matches first (longest keyword processed first)
      // "gatal" is a substring of "gatal banget" which is already matched — blocked
      expect(result.matchedPatterns).toContain('gatal banget');
      // "gatal" pattern should be blocked since "gatal banget" already in matchedPatterns
      // and "gatal banget".includes("gatal") === true
      expect(result.matchedPatterns).not.toContain('gatal');
      expect(result.score).toBe(1);
    });

    it('one keyword matches multiple patterns — "gatal banget sampe ganggu tidur"', () => {
      const entries = [
        buildPoolEntry({
          keyword: 'gatal banget sampe ganggu tidur',
          confidence: 'high',
        }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      // This keyword contains both "gatal banget" and "ganggu tidur"
      expect(result.matchedPatterns).toContain('gatal banget');
      expect(result.matchedPatterns).toContain('ganggu tidur');
      expect(result.score).toBe(2);
    });

    it('negative patterns subtract from score', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'high' }),
        buildPoolEntry({ keyword: 'ga gatal', confidence: 'high' }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      expect(result.matchedPatterns).toContain('gatal banget');
      expect(result.matchedPatterns).toContain('ga gatal');
      // 1 (gatal banget) + (-2) (ga gatal) = -1
      expect(result.score).toBe(-1);
    });

    it('pattern with score 0 still blocks shorter substrings', () => {
      // "agak gatal" has score 0, and contains "gatal"
      // If "agak gatal" matches first, "gatal" (score 1) should be blocked
      const entries = [
        buildPoolEntry({ keyword: 'agak gatal', confidence: 'high' }),
        buildPoolEntry({ keyword: 'gatal', confidence: 'high' }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      // "agak gatal" is longer, processed first, matches "agak gatal" pattern (score 0)
      expect(result.matchedPatterns).toContain('agak gatal');
      // "gatal" should be blocked because "agak gatal".includes("gatal") === true
      expect(result.matchedPatterns).not.toContain('gatal');
      expect(result.score).toBe(0);
    });

    it('unmatched keywords are collected', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'high' }),
        buildPoolEntry({
          keyword: 'sesuatu yang tidak ada di tabel',
          confidence: 'medium',
        }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      expect(result.unmatchedKeywords).toContain('sesuatu yang tidak ada di tabel');
      expect(result.matchedPatterns).toContain('gatal banget');
    });

    it('keywords with confidence "low" are excluded from matching', () => {
      const entries = [
        buildPoolEntry({ keyword: 'gatal banget', confidence: 'low' }),
        buildPoolEntry({ keyword: 'ganggu tidur', confidence: 'low' }),
      ];
      const positiveRules = PATTERN_TABLE_ID.positive.intensitas as KeywordRule[];
      const negativeRules = (PATTERN_TABLE_ID.negative.intensitas ?? []) as KeywordRule[];

      const result = matchKeywords(entries, positiveRules, negativeRules);

      expect(result.score).toBe(0);
      expect(result.matchedPatterns).toHaveLength(0);
      // Low confidence keywords should not appear in unmatched either (they're excluded entirely)
      expect(result.unmatchedKeywords).toHaveLength(0);
    });
  });
});
