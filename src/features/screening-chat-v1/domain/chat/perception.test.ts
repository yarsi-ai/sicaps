import { describe, it, expect } from 'vitest';
import { getPerceptionIndicators, buildPerceptionInferenceContext } from './perception';
import type { Perception } from '../types';
import type { SupportedLocale } from '../config';

const ALL_PERCEPTIONS: Perception[] = ['UNDERESTIMATE', 'OVERESTIMATE', 'BARRIER', 'ADEQUATE'];

const ALL_LOCALES: SupportedLocale[] = ['id', 'en'];

describe('getPerceptionIndicators', () => {
  it('returns all 4 perception categories for id locale', () => {
    const indicators = getPerceptionIndicators('id');

    for (const perception of ALL_PERCEPTIONS) {
      expect(indicators[perception]).toBeDefined();
      expect(Array.isArray(indicators[perception])).toBe(true);
    }
  });

  it('returns all 4 perception categories for en locale', () => {
    const indicators = getPerceptionIndicators('en');

    for (const perception of ALL_PERCEPTIONS) {
      expect(indicators[perception]).toBeDefined();
      expect(Array.isArray(indicators[perception])).toBe(true);
    }
  });

  it('returns at least 2 indicator phrases per category for id locale', () => {
    const indicators = getPerceptionIndicators('id');

    for (const perception of ALL_PERCEPTIONS) {
      expect(indicators[perception].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns at least 3 indicator phrases per category for en locale (Req 11.4)', () => {
    const indicators = getPerceptionIndicators('en');

    for (const perception of ALL_PERCEPTIONS) {
      expect(indicators[perception].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('returns non-empty strings for all indicators', () => {
    for (const locale of ALL_LOCALES) {
      const indicators = getPerceptionIndicators(locale);

      for (const perception of ALL_PERCEPTIONS) {
        for (const phrase of indicators[perception]) {
          expect(phrase.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('returns distinct phrases within each category', () => {
    for (const locale of ALL_LOCALES) {
      const indicators = getPerceptionIndicators(locale);

      for (const perception of ALL_PERCEPTIONS) {
        const phrases = indicators[perception];
        const unique = new Set(phrases);
        expect(unique.size).toBe(phrases.length);
      }
    }
  });
});

describe('buildPerceptionInferenceContext', () => {
  it('returns a non-empty string for each perception and locale', () => {
    for (const locale of ALL_LOCALES) {
      for (const perception of ALL_PERCEPTIONS) {
        const result = buildPerceptionInferenceContext(perception, locale);
        expect(result.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('returns distinct strings for each perception within a locale', () => {
    for (const locale of ALL_LOCALES) {
      const results = ALL_PERCEPTIONS.map((p) => buildPerceptionInferenceContext(p, locale));
      const unique = new Set(results);
      expect(unique.size).toBe(ALL_PERCEPTIONS.length);
    }
  });

  it('returns corrective framing for UNDERESTIMATE', () => {
    const resultId = buildPerceptionInferenceContext('UNDERESTIMATE', 'id');
    const resultEn = buildPerceptionInferenceContext('UNDERESTIMATE', 'en');

    expect(resultId.toLowerCase()).toContain('korektif');
    expect(resultEn.toLowerCase()).toContain('corrective');
  });

  it('returns reassuring framing for OVERESTIMATE', () => {
    const resultId = buildPerceptionInferenceContext('OVERESTIMATE', 'id');
    const resultEn = buildPerceptionInferenceContext('OVERESTIMATE', 'en');

    expect(resultId.toLowerCase()).toContain('menenangkan');
    expect(resultEn.toLowerCase()).toContain('reassuring');
  });

  it('returns supportive framing for BARRIER', () => {
    const resultId = buildPerceptionInferenceContext('BARRIER', 'id');
    const resultEn = buildPerceptionInferenceContext('BARRIER', 'en');

    expect(resultId.toLowerCase()).toContain('hambatan');
    expect(resultEn.toLowerCase()).toContain('barrier');
  });

  it('returns confirmatory framing for ADEQUATE', () => {
    const resultId = buildPerceptionInferenceContext('ADEQUATE', 'id');
    const resultEn = buildPerceptionInferenceContext('ADEQUATE', 'en');

    expect(resultId.toLowerCase()).toContain('konfirmasi');
    expect(resultEn.toLowerCase()).toContain('confirm');
  });

  it('returns locale-appropriate content for id locale', () => {
    const result = buildPerceptionInferenceContext('UNDERESTIMATE', 'id');
    // Indonesian framing should contain Indonesian words
    expect(result).toContain('Pengguna');
  });

  it('returns locale-appropriate content for en locale', () => {
    const result = buildPerceptionInferenceContext('UNDERESTIMATE', 'en');
    // English framing should contain English words
    expect(result).toContain('user');
  });
});
