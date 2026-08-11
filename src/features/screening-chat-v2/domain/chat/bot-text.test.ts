import { describe, it, expect } from 'vitest';

import {
  getBotText,
  buildFallbackTemplate,
  buildHardLimitMessage,
  pickChipsIntro,
  getEdukasiPoints,
  type Locale,
} from './bot-text';
import type { ChipsType, DimensionName, RiskLevel } from '../types';

const LOCALES: Locale[] = ['id', 'en'];
const DIMENSIONS: DimensionName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];
const CHIPS_TYPES: ChipsType[] = ['kontak', 'lokasi', 'asrama', 'tukar_alat'];
const RISK_LEVELS: RiskLevel[] = ['HIGH', 'MODERATE', 'LOW'];

describe('getBotText', () => {
  for (const locale of LOCALES) {
    it(`returns a fully populated bundle for ${locale}`, () => {
      const text = getBotText(locale);

      expect(text.greeting.length).toBeGreaterThan(0);
      expect(text.fallbackGeneric.length).toBeGreaterThan(0);
      expect(text.technicalError.length).toBeGreaterThan(0);
      expect(text.crisis.high.length).toBeGreaterThan(0);
      expect(text.crisis.low.length).toBeGreaterThan(0);
    });

    it(`covers every dimension in the ${locale} fallback templates`, () => {
      const { fallbackByDimension } = getBotText(locale);

      for (const dimension of DIMENSIONS) {
        expect(fallbackByDimension[dimension].length).toBeGreaterThan(0);
      }
    });
  }

  it('returns distinct copy per locale', () => {
    expect(getBotText('en').greeting).not.toBe(getBotText('id').greeting);
    expect(getBotText('en').technicalError).not.toBe(getBotText('id').technicalError);
  });

  it('falls back to Indonesian for an unknown locale', () => {
    const unknown = getBotText('de' as Locale);

    expect(unknown.greeting).toBe(getBotText('id').greeting);
  });
});

describe('buildFallbackTemplate', () => {
  it('targets the first pending dimension', () => {
    const result = buildFallbackTemplate(['waktu', 'lesi'], 'id');

    expect(result).toBe(getBotText('id').fallbackByDimension.waktu);
  });

  it('returns the generic nudge when no dimensions are pending', () => {
    expect(buildFallbackTemplate([], 'id')).toBe(getBotText('id').fallbackGeneric);
  });

  it('returns the generic nudge for an unrecognised dimension', () => {
    expect(buildFallbackTemplate(['not_a_dimension'], 'en')).toBe(getBotText('en').fallbackGeneric);
  });

  it('returns English copy for the en locale', () => {
    const result = buildFallbackTemplate(['waktu'], 'en');

    expect(result).toBe(getBotText('en').fallbackByDimension.waktu);
    expect(result).not.toBe(getBotText('id').fallbackByDimension.waktu);
  });
});

describe('buildHardLimitMessage', () => {
  it('explains the missing data when dimensions remain unfilled', () => {
    expect(buildHardLimitMessage(['lesi'], 'id')).toBe(getBotText('id').hardLimitIncomplete);
  });

  it('closes plainly when nothing is missing', () => {
    expect(buildHardLimitMessage([], 'id')).toBe(getBotText('id').hardLimitComplete);
  });

  it('returns English copy for the en locale', () => {
    expect(buildHardLimitMessage(['lesi'], 'en')).toBe(getBotText('en').hardLimitIncomplete);
  });
});

describe('pickChipsIntro', () => {
  for (const locale of LOCALES) {
    for (const chipsType of CHIPS_TYPES) {
      it(`returns a ${locale} intro from the ${chipsType} pool`, () => {
        const result = pickChipsIntro(chipsType, locale);

        expect(getBotText(locale).chipsIntro[chipsType]).toContain(result);
      });
    }
  }
});

describe('getEdukasiPoints', () => {
  for (const locale of LOCALES) {
    for (const riskLevel of RISK_LEVELS) {
      it(`returns unnumbered ${locale} points for ${riskLevel}`, () => {
        const points = getEdukasiPoints(riskLevel, locale);

        expect(points.length).toBeGreaterThan(0);
        for (const point of points) {
          expect(point).not.toMatch(/^\d+\.\s/);
        }
      });
    }
  }

  it('gives HIGH risk more points than LOW risk', () => {
    expect(getEdukasiPoints('HIGH', 'id').length).toBeGreaterThan(
      getEdukasiPoints('LOW', 'id').length,
    );
  });

  it('returns English copy for the en locale', () => {
    expect(getEdukasiPoints('HIGH', 'en')).not.toEqual(getEdukasiPoints('HIGH', 'id'));
  });
});
