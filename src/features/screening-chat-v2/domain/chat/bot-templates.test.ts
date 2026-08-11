import { describe, it, expect } from 'vitest';

import { BOT_TEMPLATES, selectBotTemplate } from './bot-templates';
import type { Locale } from './bot-text';
import type { ChipsType, ToneTheme } from '../types';

const LOCALES: Locale[] = ['id', 'en'];
const CHIPS_TYPES: ChipsType[] = ['kontak', 'lokasi', 'asrama', 'tukar_alat'];
const TONES: ToneTheme[] = ['playful', 'hybrid'];

describe('BOT_TEMPLATES pool sizes', () => {
  for (const locale of LOCALES) {
    for (const chipsType of CHIPS_TYPES) {
      for (const tone of TONES) {
        it(`${locale} ${chipsType}/${tone} has at least 3 templates`, () => {
          expect(BOT_TEMPLATES[locale][chipsType][tone].length).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
});

describe('BOT_TEMPLATES content validity', () => {
  for (const locale of LOCALES) {
    for (const chipsType of CHIPS_TYPES) {
      for (const tone of TONES) {
        it(`all ${locale} ${chipsType}/${tone} templates are non-empty strings`, () => {
          const pool = BOT_TEMPLATES[locale][chipsType][tone];
          for (const template of pool) {
            expect(typeof template).toBe('string');
            expect(template.length).toBeGreaterThan(0);
          }
        });
      }
    }
  }

  it('covers every locale with the same chips types and tones', () => {
    for (const chipsType of CHIPS_TYPES) {
      for (const tone of TONES) {
        expect(Array.isArray(BOT_TEMPLATES.id[chipsType][tone])).toBe(true);
        expect(Array.isArray(BOT_TEMPLATES.en[chipsType][tone])).toBe(true);
      }
    }
  });
});

describe('selectBotTemplate', () => {
  for (const locale of LOCALES) {
    for (const chipsType of CHIPS_TYPES) {
      for (const tone of TONES) {
        it(`returns a template from the ${locale} ${chipsType}/${tone} pool`, () => {
          const result = selectBotTemplate(chipsType, tone, locale);

          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
          expect(BOT_TEMPLATES[locale][chipsType][tone]).toContain(result);
        });
      }
    }
  }

  it('defaults to Indonesian when no locale is given', () => {
    const result = selectBotTemplate('kontak', 'hybrid');

    expect(BOT_TEMPLATES.id.kontak.hybrid).toContain(result);
  });

  it('returns English copy for the en locale', () => {
    const result = selectBotTemplate('kontak', 'hybrid', 'en');

    expect(BOT_TEMPLATES.en.kontak.hybrid).toContain(result);
    expect(BOT_TEMPLATES.id.kontak.hybrid).not.toContain(result);
  });
});
