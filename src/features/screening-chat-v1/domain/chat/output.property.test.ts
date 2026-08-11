import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildOutputContext, getFallbackTemplate } from './output';
import type { RiskLevel, SupportedLocale } from '../config';
import type { CategoryName } from '../keywords/types';
import type { Perception, Theme } from '../types';

/**
 * Property-based tests for the output generation module.
 *
 * Validates: Requirements 7.1, 7.2, 7.6
 */

// ─── Arbitraries ───

const ALL_CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('LOW', 'MODERATE', 'HIGH');

const perceptionArb: fc.Arbitrary<Perception> = fc.constantFrom(
  'UNDERESTIMATE',
  'OVERESTIMATE',
  'BARRIER',
  'ADEQUATE',
);

const localeArb: fc.Arbitrary<SupportedLocale> = fc.constantFrom('id', 'en');

const themeArb: fc.Arbitrary<Theme> = fc.constantFrom('playful', 'hybrid');

/** Arbitrary subset of categories (for categoriesAssessed) */
const categorySubsetArb: fc.Arbitrary<CategoryName[]> = fc.subarray(ALL_CATEGORIES, {
  minLength: 0,
  maxLength: 6,
});

/** Arbitrary matched keywords record (each category gets 0-3 keyword strings) */
const matchedKeywordsArb: fc.Arbitrary<Record<CategoryName, string[]>> = fc
  .tuple(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
  )
  .map(([intensitas, waktu, lokasi_tubuh, kontak, lesi, faktor_risiko]) => ({
    intensitas,
    waktu,
    lokasi_tubuh,
    kontak,
    lesi,
    faktor_risiko,
  }));

/** Arbitrary scores record (each category gets a score 0-2) */
const scoresArb: fc.Arbitrary<Record<CategoryName, number>> = fc
  .tuple(
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: 0, max: 2 }),
  )
  .map(([intensitas, waktu, lokasi_tubuh, kontak, lesi, faktor_risiko]) => ({
    intensitas,
    waktu,
    lokasi_tubuh,
    kontak,
    lesi,
    faktor_risiko,
  }));

/** Arbitrary total score (0-12 range for 6 categories × max 2) */
const totalScoreArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 12 });

/** Full params arbitrary for buildOutputContext */
const outputParamsArb = fc.record({
  riskLevel: riskLevelArb,
  perception: perceptionArb,
  locale: localeArb,
  theme: themeArb,
  categoriesAssessed: categorySubsetArb,
  matchedKeywords: matchedKeywordsArb,
  scores: scoresArb,
  totalScore: totalScoreArb,
  isForceClose: fc.boolean(),
});

// ─── Property 11: Output context completeness ───

describe('Feature: ai-chat-bot, Property 11: Output context completeness', () => {
  it('buildOutputContext produces an OutputContext with all required fields for any completed session state', () => {
    fc.assert(
      fc.property(outputParamsArb, (params) => {
        const result = buildOutputContext(params);

        // All required fields exist
        expect(result).toHaveProperty('riskLevel');
        expect(result).toHaveProperty('perception');
        expect(result).toHaveProperty('locale');
        expect(result).toHaveProperty('theme');
        expect(result).toHaveProperty('categoriesAssessed');
        expect(result).toHaveProperty('categoriesNotAssessed');
        expect(result).toHaveProperty('isForceClose');
        expect(result).toHaveProperty('matchedKeywords');
        expect(result).toHaveProperty('scores');
        expect(result).toHaveProperty('totalScore');

        // Correct types
        expect(typeof result.riskLevel).toBe('string');
        expect(typeof result.perception).toBe('string');
        expect(typeof result.locale).toBe('string');
        expect(typeof result.theme).toBe('string');
        expect(Array.isArray(result.categoriesAssessed)).toBe(true);
        expect(Array.isArray(result.categoriesNotAssessed)).toBe(true);
        expect(typeof result.isForceClose).toBe('boolean');
        expect(typeof result.matchedKeywords).toBe('object');
        expect(typeof result.scores).toBe('object');
        expect(typeof result.totalScore).toBe('number');
      }),
      { numRuns: 100 },
    );
  });

  it('categoriesAssessed and categoriesNotAssessed are complementary to full category set', () => {
    fc.assert(
      fc.property(outputParamsArb, (params) => {
        const result = buildOutputContext(params);

        const combined = [...result.categoriesAssessed, ...result.categoriesNotAssessed].sort();
        const allSorted = [...ALL_CATEGORIES].sort();

        expect(combined).toEqual(allSorted);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Risk level template mapping ───

describe('Feature: ai-chat-bot, Property 12: Risk level template mapping', () => {
  it('getFallbackTemplate returns template with correct risk-level keywords for each RiskLevel and locale', () => {
    fc.assert(
      fc.property(riskLevelArb, localeArb, (riskLevel, locale) => {
        const template = getFallbackTemplate(riskLevel, locale);

        // Template has all required fields
        expect(template).toHaveProperty('kesimpulan');
        expect(template).toHaveProperty('persepsi');
        expect(template).toHaveProperty('rekomendasi');
        expect(template).toHaveProperty('saranPenanganan');

        // persepsi and saranPenanganan are null in fallback
        expect(template.persepsi).toBeNull();
        expect(template.saranPenanganan).toBeNull();

        // kesimpulan and rekomendasi are non-empty strings
        expect(typeof template.kesimpulan).toBe('string');
        expect(template.kesimpulan.length).toBeGreaterThan(0);
        expect(typeof template.rekomendasi).toBe('string');
        expect(template.rekomendasi.length).toBeGreaterThan(0);

        // Verify risk-level language in kesimpulan
        if (locale === 'id') {
          if (riskLevel === 'HIGH') {
            expect(template.kesimpulan).toContain('tinggi');
          } else if (riskLevel === 'MODERATE') {
            expect(template.kesimpulan).toContain('sedang');
          } else {
            expect(template.kesimpulan).toContain('rendah');
          }
        } else {
          if (riskLevel === 'HIGH') {
            expect(template.kesimpulan.toLowerCase()).toContain('high');
          } else if (riskLevel === 'MODERATE') {
            expect(template.kesimpulan.toLowerCase()).toContain('moderate');
          } else {
            expect(template.kesimpulan.toLowerCase()).toContain('low');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: Output locale propagation ───

describe('Feature: ai-chat-bot, Property 13: Output locale propagation', () => {
  it('buildOutputContext output locale always matches input locale', () => {
    fc.assert(
      fc.property(outputParamsArb, (params) => {
        const result = buildOutputContext(params);
        expect(result.locale).toBe(params.locale);
      }),
      { numRuns: 100 },
    );
  });
});
