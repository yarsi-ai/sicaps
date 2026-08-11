import { describe, it, expect } from 'vitest';
import { buildOutputContext, getFallbackTemplate, getBaseRecommendationTemplate } from './output';
import type { RiskLevel, SupportedLocale } from '../config';
import type { CategoryName } from '../keywords/types';
import type { Perception } from '../types';

const ALL_CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

const RISK_LEVELS: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH'];
const LOCALES: SupportedLocale[] = ['id', 'en'];

describe('buildOutputContext', () => {
  const baseParams = {
    riskLevel: 'HIGH' as RiskLevel,
    perception: 'ADEQUATE' as Perception,
    locale: 'id' as SupportedLocale,
    theme: 'hybrid' as const,
    categoriesAssessed: ['intensitas', 'waktu', 'kontak'] as CategoryName[],
    matchedKeywords: {
      intensitas: ['gatal hebat'],
      waktu: ['malam hari'],
      lokasi_tubuh: [],
      kontak: ['kontak langsung'],
      lesi: [],
      faktor_risiko: [],
    },
    scores: {
      intensitas: 2,
      waktu: 1,
      lokasi_tubuh: 0,
      kontak: 1,
      lesi: 0,
      faktor_risiko: 0,
    },
    totalScore: 4,
    isForceClose: false,
  };

  it('passes through all scalar fields directly', () => {
    const result = buildOutputContext(baseParams);

    expect(result.riskLevel).toBe('HIGH');
    expect(result.perception).toBe('ADEQUATE');
    expect(result.locale).toBe('id');
    expect(result.theme).toBe('hybrid');
    expect(result.isForceClose).toBe(false);
    expect(result.totalScore).toBe(4);
  });

  it('passes through categoriesAssessed', () => {
    const result = buildOutputContext(baseParams);
    expect(result.categoriesAssessed).toEqual(['intensitas', 'waktu', 'kontak']);
  });

  it('computes categoriesNotAssessed as all categories minus assessed', () => {
    const result = buildOutputContext(baseParams);
    expect(result.categoriesNotAssessed).toEqual(['lokasi_tubuh', 'lesi', 'faktor_risiko']);
  });

  it('returns empty categoriesNotAssessed when all categories assessed', () => {
    const result = buildOutputContext({
      ...baseParams,
      categoriesAssessed: ALL_CATEGORIES,
    });
    expect(result.categoriesNotAssessed).toEqual([]);
  });

  it('returns all 6 categories in categoriesNotAssessed when none assessed', () => {
    const result = buildOutputContext({
      ...baseParams,
      categoriesAssessed: [],
    });
    expect(result.categoriesNotAssessed).toEqual(ALL_CATEGORIES);
  });

  it('passes through matchedKeywords', () => {
    const result = buildOutputContext(baseParams);
    expect(result.matchedKeywords).toEqual(baseParams.matchedKeywords);
  });

  it('passes through scores', () => {
    const result = buildOutputContext(baseParams);
    expect(result.scores).toEqual(baseParams.scores);
  });

  it('handles forceClose flag correctly', () => {
    const result = buildOutputContext({ ...baseParams, isForceClose: true });
    expect(result.isForceClose).toBe(true);
  });

  it('preserves locale in output', () => {
    const resultEn = buildOutputContext({ ...baseParams, locale: 'en' });
    expect(resultEn.locale).toBe('en');

    const resultId = buildOutputContext({ ...baseParams, locale: 'id' });
    expect(resultId.locale).toBe('id');
  });

  it('produces JSON-serializable output', () => {
    const result = buildOutputContext(baseParams);
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
  });
});

describe('getFallbackTemplate', () => {
  it('returns a FallbackOutput for every risk-level/locale combination', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        expect(result).toHaveProperty('kesimpulan');
        expect(result).toHaveProperty('persepsi');
        expect(result).toHaveProperty('rekomendasi');
        expect(result).toHaveProperty('saranPenanganan');
      }
    }
  });

  it('always returns persepsi as null', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        expect(result.persepsi).toBeNull();
      }
    }
  });

  it('always returns saranPenanganan as null', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        expect(result.saranPenanganan).toBeNull();
      }
    }
  });

  it('returns non-empty kesimpulan for all combinations', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        expect(result.kesimpulan.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns non-empty rekomendasi for all combinations', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        expect(result.rekomendasi.length).toBeGreaterThan(0);
      }
    }
  });

  describe('HIGH risk templates', () => {
    it('HIGH-id mentions high risk in Indonesian', () => {
      const result = getFallbackTemplate('HIGH', 'id');
      expect(result.kesimpulan.toLowerCase()).toMatch(/tinggi/);
    });

    it('HIGH-en mentions high risk in English', () => {
      const result = getFallbackTemplate('HIGH', 'en');
      expect(result.kesimpulan.toLowerCase()).toMatch(/high/);
    });

    it('HIGH-id recommends seeking medical care', () => {
      const result = getFallbackTemplate('HIGH', 'id');
      expect(result.rekomendasi.toLowerCase()).toMatch(/fasilitas kesehatan/);
    });

    it('HIGH-en recommends seeking healthcare', () => {
      const result = getFallbackTemplate('HIGH', 'en');
      expect(result.rekomendasi.toLowerCase()).toMatch(/seek healthcare/);
    });
  });

  describe('MODERATE risk templates', () => {
    it('MODERATE-id mentions moderate risk in Indonesian', () => {
      const result = getFallbackTemplate('MODERATE', 'id');
      expect(result.kesimpulan.toLowerCase()).toMatch(/sedang/);
    });

    it('MODERATE-en mentions moderate risk in English', () => {
      const result = getFallbackTemplate('MODERATE', 'en');
      expect(result.kesimpulan.toLowerCase()).toMatch(/moderate/);
    });

    it('MODERATE-id recommends monitoring and consulting', () => {
      const result = getFallbackTemplate('MODERATE', 'id');
      expect(result.rekomendasi.toLowerCase()).toMatch(/pantau/);
      expect(result.rekomendasi.toLowerCase()).toMatch(/konsultasi/);
    });

    it('MODERATE-en recommends monitoring and consulting', () => {
      const result = getFallbackTemplate('MODERATE', 'en');
      expect(result.rekomendasi.toLowerCase()).toMatch(/monitor/);
      expect(result.rekomendasi.toLowerCase()).toMatch(/consult/);
    });
  });

  describe('LOW risk templates', () => {
    it('LOW-id mentions low risk in Indonesian', () => {
      const result = getFallbackTemplate('LOW', 'id');
      expect(result.kesimpulan.toLowerCase()).toMatch(/rendah/);
    });

    it('LOW-en mentions low risk in English', () => {
      const result = getFallbackTemplate('LOW', 'en');
      expect(result.kesimpulan.toLowerCase()).toMatch(/low/);
    });

    it('LOW-id recommends maintaining hygiene', () => {
      const result = getFallbackTemplate('LOW', 'id');
      expect(result.rekomendasi.toLowerCase()).toMatch(/kebersihan/);
    });

    it('LOW-en recommends maintaining hygiene', () => {
      const result = getFallbackTemplate('LOW', 'en');
      expect(result.rekomendasi.toLowerCase()).toMatch(/hygiene/);
    });
  });

  it('produces 6 distinct templates', () => {
    const templates = new Set<string>();
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getFallbackTemplate(riskLevel, locale);
        templates.add(JSON.stringify(result));
      }
    }
    expect(templates.size).toBe(6);
  });
});

describe('getBaseRecommendationTemplate', () => {
  it('returns a non-empty string for every risk-level/locale combination', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getBaseRecommendationTemplate(riskLevel, locale);
        expect(result).toBeTypeOf('string');
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });

  describe('HIGH risk key action points', () => {
    it('HIGH-id contains all required action points', () => {
      const text = getBaseRecommendationTemplate('HIGH', 'id').toLowerCase();
      expect(text).toMatch(/fasilitas kesehatan|kunjungi/);
      expect(text).toMatch(/berbagi barang pribadi/);
      expect(text).toMatch(/kebersihan/);
      expect(text).toMatch(/seprai/);
    });

    it('HIGH-en contains all required action points', () => {
      const text = getBaseRecommendationTemplate('HIGH', 'en').toLowerCase();
      expect(text).toMatch(/seek healthcare/);
      expect(text).toMatch(/sharing personal items/);
      expect(text).toMatch(/hygiene/);
      expect(text).toMatch(/bedsheets/);
    });
  });

  describe('MODERATE risk key action points', () => {
    it('MODERATE-id contains all required action points', () => {
      const text = getBaseRecommendationTemplate('MODERATE', 'id').toLowerCase();
      expect(text).toMatch(/pantau/);
      expect(text).toMatch(/konsultasi/);
      expect(text).toMatch(/kebersihan/);
      expect(text).toMatch(/berbagi barang pribadi/);
    });

    it('MODERATE-en contains all required action points', () => {
      const text = getBaseRecommendationTemplate('MODERATE', 'en').toLowerCase();
      expect(text).toMatch(/monitor/);
      expect(text).toMatch(/consult/);
      expect(text).toMatch(/hygiene/);
      expect(text).toMatch(/sharing personal items/);
    });
  });

  describe('LOW risk key action points', () => {
    it('LOW-id contains all required action points', () => {
      const text = getBaseRecommendationTemplate('LOW', 'id').toLowerCase();
      expect(text).toMatch(/kebersihan/);
      expect(text).toMatch(/pantau/);
      expect(text).toMatch(/konsultasi/);
    });

    it('LOW-en contains all required action points', () => {
      const text = getBaseRecommendationTemplate('LOW', 'en').toLowerCase();
      expect(text).toMatch(/hygiene/);
      expect(text).toMatch(/monitor/);
      expect(text).toMatch(/consult/);
    });
  });

  it('produces 6 distinct templates', () => {
    const templates = new Set<string>();
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        templates.add(getBaseRecommendationTemplate(riskLevel, locale));
      }
    }
    expect(templates.size).toBe(6);
  });

  it('produces JSON-serializable strings', () => {
    for (const riskLevel of RISK_LEVELS) {
      for (const locale of LOCALES) {
        const result = getBaseRecommendationTemplate(riskLevel, locale);
        expect(JSON.parse(JSON.stringify(result))).toBe(result);
      }
    }
  });
});
