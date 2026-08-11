import { describe, it, expect } from 'vitest';

import {
  PROMPT_KEYWORDS_ID,
  PROMPT_KEYWORDS_EN,
  getPromptKeywordTable,
  getPromptKeywordList,
} from './prompt-keywords';
import type { PromptKeywordTable } from './prompt-keywords';

const DIMENSIONS = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
  'negatif',
] as const;

describe('getPromptKeywordTable', () => {
  it('returns the Indonesian table for id', () => {
    expect(getPromptKeywordTable('id')).toBe(PROMPT_KEYWORDS_ID);
  });

  it('returns the English table for en', () => {
    expect(getPromptKeywordTable('en')).toBe(PROMPT_KEYWORDS_EN);
  });

  for (const [locale, table] of Object.entries({
    id: PROMPT_KEYWORDS_ID,
    en: PROMPT_KEYWORDS_EN,
  }) as Array<['id' | 'en', PromptKeywordTable]>) {
    it(`covers every dimension for ${locale}`, () => {
      for (const dimension of DIMENSIONS) {
        expect(table[dimension].keywords.length).toBeGreaterThan(0);
        expect(table[dimension].heading.length).toBeGreaterThan(0);
      }
    });

    it(`has non-empty, unique keywords per dimension for ${locale}`, () => {
      for (const dimension of DIMENSIONS) {
        const keywords = table[dimension].keywords.map((k) => k.keyword);

        for (const keyword of keywords) {
          expect(keyword.trim().length).toBeGreaterThan(0);
        }
        expect(new Set(keywords).size).toBe(keywords.length);
      }
    });

    it(`never sets both gloss and note on one keyword for ${locale}`, () => {
      for (const dimension of DIMENSIONS) {
        for (const entry of table[dimension].keywords) {
          expect(Boolean(entry.gloss && entry.note)).toBe(false);
        }
      }
    });
  }

  it('uses the same dimension keys across locales', () => {
    expect(Object.keys(PROMPT_KEYWORDS_EN)).toEqual(Object.keys(PROMPT_KEYWORDS_ID));
  });
});

describe('getPromptKeywordList', () => {
  it('flattens each dimension to its keyword strings', () => {
    const list = getPromptKeywordList('id');

    expect(list.intensitas).toContain('parah');
    expect(list.waktu).toContain('malam');
    expect(list.negatif).toContain('tidak gatal');
  });

  it('returns English keywords for the en locale', () => {
    const list = getPromptKeywordList('en');

    expect(list.intensitas).toContain('severe');
    expect(list.lokasi_tubuh).toContain('between fingers');
    expect(list.intensitas).not.toContain('parah');
  });

  it('matches the source table entry counts', () => {
    for (const locale of ['id', 'en'] as const) {
      const table = getPromptKeywordTable(locale);
      const list = getPromptKeywordList(locale);

      for (const dimension of DIMENSIONS) {
        expect(list[dimension]).toHaveLength(table[dimension].keywords.length);
      }
    }
  });
});
