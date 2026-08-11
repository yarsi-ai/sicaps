import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { appendToPool } from './pool';
import {
  buildPoolEntry,
  buildExtraction,
  buildKeywordPool,
} from '../../../../../__test-utils__/factories/scoring';
import { normalize } from './normalize';
import type { Confidence, CategoryName, CategoryExtraction, KeywordPool } from '../keywords/types';

const CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Arbitraries for property-based tests
const confidenceArb = fc.constantFrom<Confidence>('high', 'medium', 'low');
const categoryArb = fc.constantFrom<CategoryName>(
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
);
const keywordArb = fc.string({ minLength: 1, maxLength: 50 });

const extractedKeywordArb = fc.record({
  keyword: keywordArb,
  confidence: confidenceArb,
});

const categoryExtractionArb = fc.record({
  intensitas: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
  waktu: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
  lokasi_tubuh: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
  kontak: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
  lesi: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
  faktor_risiko: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 5 }),
});

describe('appendToPool', () => {
  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 3.2, 3.7**
     * P5: after any sequence of appends, no category contains duplicate normalized keywords.
     */
    it('P5: no category contains duplicate normalized keywords after any sequence of appends', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(categoryExtractionArb, fc.integer({ min: 1, max: 20 })), {
            minLength: 1,
            maxLength: 5,
          }),
          (appendSequence) => {
            let pool = buildKeywordPool();

            for (const [extraction, turn] of appendSequence) {
              pool = appendToPool(pool, extraction, turn);
            }

            for (const category of CATEGORIES) {
              const normalizedKeywords = pool[category].map((entry) => normalize(entry.keyword));
              const unique = new Set(normalizedKeywords);
              expect(unique.size).toBe(normalizedKeywords.length);
            }
          },
        ),
      );
    });

    /**
     * **Validates: Requirements 3.3, 3.4**
     * P13: confidence only upgrades (high > medium > low), never downgrades.
     */
    it('P13: confidence only upgrades, never downgrades', () => {
      fc.assert(
        fc.property(
          categoryArb,
          keywordArb,
          fc.array(confidenceArb, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 1, max: 20 }),
          (category, keyword, confidences, startTurn) => {
            let pool = buildKeywordPool();
            let maxConfidenceSeen = 0;

            for (let i = 0; i < confidences.length; i++) {
              const confidence = confidences[i]!;
              const extraction = buildExtraction({
                [category]: [{ keyword, confidence }],
              });

              pool = appendToPool(pool, extraction, startTurn + i);

              const normalizedKw = normalize(keyword);
              if (normalizedKw === '') return; // skip empty normalizations

              const entry = pool[category].find((e) => normalize(e.keyword) === normalizedKw);

              expect(entry).toBeDefined();

              const currentConfidenceValue = CONFIDENCE_ORDER[entry!.confidence];
              maxConfidenceSeen = Math.max(maxConfidenceSeen, CONFIDENCE_ORDER[confidence]);

              // Stored confidence must be >= max confidence ever appended
              expect(currentConfidenceValue).toBeGreaterThanOrEqual(maxConfidenceSeen);
            }
          },
        ),
      );
    });
  });

  describe('append behavior', () => {
    it('appends new keywords to correct category', () => {
      const pool = buildKeywordPool();
      const extraction = buildExtraction({
        intensitas: [{ keyword: 'gatal banget', confidence: 'high' }],
        waktu: [{ keyword: 'malam hari', confidence: 'medium' }],
      });

      const result = appendToPool(pool, extraction, 1);

      expect(result.intensitas).toHaveLength(1);
      expect(result.intensitas[0]!.keyword).toBe('gatal banget');
      expect(result.intensitas[0]!.confidence).toBe('high');
      expect(result.intensitas[0]!.turn).toBe(1);

      expect(result.waktu).toHaveLength(1);
      expect(result.waktu[0]!.keyword).toBe('malam hari');
      expect(result.waktu[0]!.confidence).toBe('medium');
      expect(result.waktu[0]!.turn).toBe(1);
    });

    it('deduplicates by normalized keyword within same category', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'medium', turn: 1 })],
      });
      const extraction = buildExtraction({
        intensitas: [{ keyword: 'GATAL   BANGET', confidence: 'medium' }],
      });

      const result = appendToPool(pool, extraction, 2);

      expect(result.intensitas).toHaveLength(1);
    });

    it('upgrades confidence when higher value arrives for same keyword', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'low', turn: 1 })],
      });
      const extraction = buildExtraction({
        intensitas: [{ keyword: 'gatal banget', confidence: 'high' }],
      });

      const result = appendToPool(pool, extraction, 2);

      expect(result.intensitas).toHaveLength(1);
      expect(result.intensitas[0]!.confidence).toBe('high');
    });

    it('retains existing confidence when equal or lower value arrives', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal banget', confidence: 'high', turn: 1 })],
      });

      // Same confidence
      const extraction1 = buildExtraction({
        intensitas: [{ keyword: 'gatal banget', confidence: 'high' }],
      });
      const result1 = appendToPool(pool, extraction1, 2);
      expect(result1.intensitas[0]!.confidence).toBe('high');

      // Lower confidence
      const extraction2 = buildExtraction({
        intensitas: [{ keyword: 'gatal banget', confidence: 'low' }],
      });
      const result2 = appendToPool(pool, extraction2, 3);
      expect(result2.intensitas[0]!.confidence).toBe('high');
    });

    it('maintains entries independently per category', () => {
      const pool = buildKeywordPool();
      const extraction = buildExtraction({
        intensitas: [{ keyword: 'gatal', confidence: 'high' }],
        kontak: [{ keyword: 'gatal', confidence: 'medium' }],
      });

      const result = appendToPool(pool, extraction, 1);

      // Same keyword in two different categories = two separate entries
      expect(result.intensitas).toHaveLength(1);
      expect(result.kontak).toHaveLength(1);
      expect(result.intensitas[0]!.confidence).toBe('high');
      expect(result.kontak[0]!.confidence).toBe('medium');
    });
  });

  describe('defensive checks (R3.4)', () => {
    it('handles undefined category in extraction without crashing', () => {
      const pool = buildKeywordPool();
      // Force undefined on a category (simulating incomplete extraction)
      const extraction = buildExtraction() as unknown as Record<string, unknown>;
      delete extraction.intensitas;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = appendToPool(pool, extraction as unknown as CategoryExtraction, 1);

      expect(result.intensitas).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('category "intensitas" is undefined/invalid'),
      );

      warnSpy.mockRestore();
    });

    it('handles null category in extraction without crashing', () => {
      const pool = buildKeywordPool();
      const extraction = buildExtraction() as unknown as Record<string, unknown>;
      extraction.waktu = null;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = appendToPool(pool, extraction as unknown as CategoryExtraction, 1);

      expect(result.waktu).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('category "waktu" is undefined/invalid'),
      );

      warnSpy.mockRestore();
    });

    it('handles non-array category value without crashing', () => {
      const pool = buildKeywordPool();
      const extraction = buildExtraction() as unknown as Record<string, unknown>;
      extraction.kontak = 'not an array';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = appendToPool(pool, extraction as unknown as CategoryExtraction, 1);

      expect(result.kontak).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('category "kontak" is undefined/invalid'),
      );

      warnSpy.mockRestore();
    });

    it('handles undefined pool category by defaulting to empty array', () => {
      const pool = buildKeywordPool() as unknown as Record<string, unknown>;
      delete pool.lesi;

      const extraction = buildExtraction({
        lesi: [{ keyword: 'kudis', confidence: 'high' }],
      });

      const result = appendToPool(pool as unknown as KeywordPool, extraction, 1);

      expect(result.lesi).toHaveLength(1);
      expect(result.lesi[0]!.keyword).toBe('kudis');
    });

    it('never throws regardless of malformed input', () => {
      const pool = buildKeywordPool();
      // Completely broken extraction — all categories missing
      const extraction = {} as unknown as CategoryExtraction;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => appendToPool(pool, extraction, 1)).not.toThrow();

      // Should warn for all 6 categories
      expect(warnSpy).toHaveBeenCalledTimes(6);

      warnSpy.mockRestore();
    });

    it('preserves existing pool entries when extraction category is undefined', () => {
      const pool = buildKeywordPool({
        intensitas: [buildPoolEntry({ keyword: 'gatal', confidence: 'high', turn: 1 })],
      });
      const extraction = buildExtraction() as unknown as Record<string, unknown>;
      delete extraction.intensitas;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = appendToPool(pool, extraction as unknown as CategoryExtraction, 2);

      // Existing entries preserved (shallow copy)
      expect(result.intensitas).toHaveLength(1);
      expect(result.intensitas[0]!.keyword).toBe('gatal');

      warnSpy.mockRestore();
    });
  });

  describe('immutability', () => {
    it('returns new pool object (input pool unchanged)', () => {
      const originalEntries = [buildPoolEntry({ keyword: 'gatal', confidence: 'low', turn: 1 })];
      const pool = buildKeywordPool({
        intensitas: originalEntries,
      });

      const extraction = buildExtraction({
        intensitas: [{ keyword: 'parah banget', confidence: 'high' }],
      });

      const result = appendToPool(pool, extraction, 2);

      // Result is a different object
      expect(result).not.toBe(pool);

      // Original pool not mutated
      expect(pool.intensitas).toHaveLength(1);
      expect(pool.intensitas[0]!.keyword).toBe('gatal');
      expect(pool.intensitas[0]!.confidence).toBe('low');

      // Result has new entry
      expect(result.intensitas).toHaveLength(2);
    });

    it('does not mutate original pool entries on confidence upgrade', () => {
      const originalEntry = buildPoolEntry({
        keyword: 'gatal',
        confidence: 'low',
        turn: 1,
      });
      const pool = buildKeywordPool({
        intensitas: [originalEntry],
      });

      const extraction = buildExtraction({
        intensitas: [{ keyword: 'gatal', confidence: 'high' }],
      });

      const result = appendToPool(pool, extraction, 2);

      // Original entry not mutated
      expect(originalEntry.confidence).toBe('low');

      // Result has upgraded confidence
      expect(result.intensitas[0]!.confidence).toBe('high');
    });
  });
});
