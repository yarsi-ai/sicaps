/**
 * Locale behaviour of the keyword-driven scoring indicators.
 *
 * These derivations are the only way `gatalMalam` can ever become true, and it
 * is one of the three gejala kunci — so an unmatched keyword silently
 * under-reports risk rather than failing loudly.
 */

import { describe, it, expect } from 'vitest';

import {
  deriveGatalMalam,
  deriveAsrama,
  deriveTukarAlat,
  getChipsCoverageKeywords,
  calculateRisk,
  INDICATOR_KEYWORDS,
} from './engine';
import { getPromptKeywordList } from '../keywords/prompt-keywords';
import type { Locale } from '../chat/bot-text';

const LOCALES: Locale[] = ['id', 'en'];

/** Shorthand for a dimensiTerisi entry. */
function dims(
  entries: Record<string, { keywords?: string[]; negasi?: string[] }>,
): Record<string, { keywords: string[]; negasi: string[] }> {
  return Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [
      k,
      { keywords: v.keywords ?? [], negasi: v.negasi ?? [] },
    ]),
  );
}

describe('deriveGatalMalam', () => {
  it('returns null when the waktu dimension is absent', () => {
    expect(deriveGatalMalam(dims({ lesi: { keywords: ['bentol'] } }), 'id')).toBeNull();
  });

  it('returns null when waktu carries no nocturnal signal', () => {
    // Duration keywords say nothing about when the itch is worse.
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['lebih 2 minggu'] } }), 'id')).toBeNull();
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['more than 2 weeks'] } }), 'en')).toBeNull();
  });

  it('detects nocturnal itch in Indonesian', () => {
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['malam'] } }), 'id')).toBe(true);
  });

  it('detects nocturnal itch in English', () => {
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['at night'] } }), 'en')).toBe(true);
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['worse at night'] } }), 'en')).toBe(true);
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['wakes me up at night'] } }), 'en')).toBe(
      true,
    );
  });

  it('detects every nocturnal keyword offered for its locale', () => {
    for (const locale of LOCALES) {
      for (const keyword of INDICATOR_KEYWORDS.nightItchTrue[locale]) {
        expect(deriveGatalMalam(dims({ waktu: { keywords: [keyword] } }), locale)).toBe(true);
      }
    }
  });

  it('lets an explicit negation win over a positive keyword', () => {
    expect(
      deriveGatalMalam(dims({ waktu: { keywords: ['malam'], negasi: ['tidak malam'] } }), 'id'),
    ).toBe(false);
    expect(
      deriveGatalMalam(dims({ waktu: { keywords: ['at night'], negasi: ['not at night'] } }), 'en'),
    ).toBe(false);
  });

  it('detects every negation keyword offered for its locale', () => {
    for (const locale of LOCALES) {
      for (const keyword of INDICATOR_KEYWORDS.nightItchFalse[locale]) {
        expect(deriveGatalMalam(dims({ waktu: { negasi: [keyword] } }), locale)).toBe(false);
      }
    }
  });

  it('ignores keyword casing and surrounding whitespace', () => {
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['  At Night '] } }), 'en')).toBe(true);
  });

  it('defaults to Indonesian when no locale is given', () => {
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['malam'] } }))).toBe(true);
  });

  it('does not cross-match the other locale', () => {
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['malam'] } }), 'en')).toBeNull();
    expect(deriveGatalMalam(dims({ waktu: { keywords: ['at night'] } }), 'id')).toBeNull();
  });
});

describe('deriveAsrama', () => {
  it('detects dormitory living per locale', () => {
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['asrama'] } }), 'id')).toBe(true);
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['dormitory'] } }), 'en')).toBe(true);
  });

  it('returns false when the dimension is absent or unrelated', () => {
    expect(deriveAsrama(dims({}), 'en')).toBe(false);
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['poor hygiene'] } }), 'en')).toBe(false);
  });

  it('does not treat room crowding as dormitory residence', () => {
    // Matches the pre-existing Indonesian behaviour; widening this is a
    // clinical decision, not part of adding English support.
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['sekamar rame'] } }), 'id')).toBe(false);
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['kasur barengan'] } }), 'id')).toBe(
      false,
    );
    expect(deriveAsrama(dims({ faktor_risiko: { keywords: ['crowded room'] } }), 'en')).toBe(false);
  });

  it('treats the two locales symmetrically', () => {
    expect(INDICATOR_KEYWORDS.asrama.id.size).toBe(INDICATOR_KEYWORDS.asrama.en.size);
    expect(INDICATOR_KEYWORDS.tukarAlat.id.size).toBe(INDICATOR_KEYWORDS.tukarAlat.en.size);
    expect(INDICATOR_KEYWORDS.nightItchTrue.id.size).toBe(INDICATOR_KEYWORDS.nightItchTrue.en.size);
    expect(INDICATOR_KEYWORDS.nightItchFalse.id.size).toBe(
      INDICATOR_KEYWORDS.nightItchFalse.en.size,
    );
  });
});

describe('deriveTukarAlat', () => {
  it('detects shared personal items per locale', () => {
    expect(deriveTukarAlat(dims({ faktor_risiko: { keywords: ['tukeran handuk'] } }), 'id')).toBe(
      true,
    );
    expect(deriveTukarAlat(dims({ faktor_risiko: { keywords: ['sharing towels'] } }), 'en')).toBe(
      true,
    );
  });

  it('returns false when the dimension is absent or unrelated', () => {
    expect(deriveTukarAlat(dims({}), 'id')).toBe(false);
    expect(deriveTukarAlat(dims({ faktor_risiko: { keywords: ['asrama'] } }), 'id')).toBe(false);
  });
});

describe('indicator vocabulary stays in sync with the extraction prompt', () => {
  // A keyword the extractor never emits can never fire, so every indicator
  // keyword must exist in the prompt vocabulary for the same locale.
  for (const locale of LOCALES) {
    it(`every ${locale} nocturnal keyword is offered by the extraction prompt`, () => {
      const offered = new Set(getPromptKeywordList(locale).waktu ?? []);

      for (const keyword of INDICATOR_KEYWORDS.nightItchTrue[locale]) {
        expect(offered).toContain(keyword);
      }
    });

    it(`every ${locale} negation keyword is offered by the extraction prompt`, () => {
      const offered = new Set(getPromptKeywordList(locale).negatif ?? []);

      for (const keyword of INDICATOR_KEYWORDS.nightItchFalse[locale]) {
        expect(offered).toContain(keyword);
      }
    });

    it(`every ${locale} risk-factor keyword is offered by the extraction prompt`, () => {
      const offered = new Set(getPromptKeywordList(locale).faktor_risiko ?? []);

      for (const keyword of [
        ...INDICATOR_KEYWORDS.asrama[locale],
        ...INDICATOR_KEYWORDS.tukarAlat[locale],
      ]) {
        expect(offered).toContain(keyword);
      }
    });

    it(`${locale} indicator sets are non-empty`, () => {
      expect(INDICATOR_KEYWORDS.nightItchTrue[locale].size).toBeGreaterThan(0);
      expect(INDICATOR_KEYWORDS.nightItchFalse[locale].size).toBeGreaterThan(0);
      expect(INDICATOR_KEYWORDS.asrama[locale].size).toBeGreaterThan(0);
      expect(INDICATOR_KEYWORDS.tukarAlat[locale].size).toBeGreaterThan(0);
    });
  }
});

describe('getChipsCoverageKeywords', () => {
  for (const locale of LOCALES) {
    it(`${locale} chips coverage keywords are readable by the derivations`, () => {
      const coverage = getChipsCoverageKeywords(locale);

      expect(
        deriveAsrama(dims({ faktor_risiko: { keywords: [coverage.asramaYes] } }), locale),
      ).toBe(true);
      expect(
        deriveTukarAlat(dims({ faktor_risiko: { keywords: [coverage.tukarAlatYes] } }), locale),
      ).toBe(true);
    });

    it(`${locale} chips coverage keywords are offered by the extraction prompt`, () => {
      const coverage = getChipsCoverageKeywords(locale);
      const kontak = new Set(getPromptKeywordList(locale).kontak ?? []);
      const negatif = new Set(getPromptKeywordList(locale).negatif ?? []);

      expect(kontak).toContain(coverage.kontakYes);
      expect(negatif).toContain(coverage.kontakNo);
    });
  }

  it('defaults to Indonesian when no locale is given', () => {
    expect(getChipsCoverageKeywords()).toEqual(getChipsCoverageKeywords('id'));
  });
});

describe('English sessions can reach the same risk levels as Indonesian ones', () => {
  // The regression this fixes: nocturnal itch never counted on English
  // sessions, capping gejalaCount at 2 and under-reporting risk.
  it('nocturnal itch plus contact reaches HIGH in both locales', () => {
    const byLocale = LOCALES.map((locale) => {
      const waktuKeyword = locale === 'id' ? 'malam' : 'at night';
      const gatalMalam = deriveGatalMalam(dims({ waktu: { keywords: [waktuKeyword] } }), locale);

      return calculateRisk({
        gatalMalam: gatalMalam === true,
        kontakSerupa: true,
        lokasiKhas: false,
        asrama: false,
        tukarAlat: false,
      });
    });

    for (const result of byLocale) {
      expect(result.gejalaCount).toBe(2);
      expect(result.riskLevel).toBe('HIGH');
    }
  });

  it('all three gejala kunci are reachable in both locales', () => {
    for (const locale of LOCALES) {
      const waktuKeyword = locale === 'id' ? 'tiap malam' : 'every night';
      const gatalMalam = deriveGatalMalam(dims({ waktu: { keywords: [waktuKeyword] } }), locale);

      const result = calculateRisk({
        gatalMalam: gatalMalam === true,
        kontakSerupa: true,
        lokasiKhas: true,
        asrama: false,
        tukarAlat: false,
      });

      expect(result.gejalaCount).toBe(3);
      expect(result.riskLevel).toBe('HIGH');
    }
  });
});
