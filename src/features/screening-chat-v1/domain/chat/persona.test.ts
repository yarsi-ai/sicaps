import { describe, it, expect } from 'vitest';
import { selectTheme, getPersonaRules } from './persona';
import type { Theme } from '../types';
import type { SupportedLocale } from '../config';

describe('selectTheme', () => {
  it('returns playful for elementary', () => {
    expect(selectTheme('elementary')).toBe('playful');
  });

  it('returns hybrid for junior_high', () => {
    expect(selectTheme('junior_high')).toBe('hybrid');
  });

  it('returns hybrid for senior_high', () => {
    expect(selectTheme('senior_high')).toBe('hybrid');
  });

  it('returns hybrid for undefined', () => {
    expect(selectTheme(undefined)).toBe('hybrid');
  });
});

describe('getPersonaRules', () => {
  describe('playful theme', () => {
    it('returns correct rules for id locale', () => {
      const rules = getPersonaRules('playful', 'id');

      expect(rules).toEqual({
        theme: 'playful',
        pronounSelf: 'Aku',
        pronounUser: 'kamu',
        maxWordsPerSentence: 15,
        emojiRange: [1, 2],
        vocabularyLevel: 'everyday',
        allowMedicalTerms: false,
      });
    });

    it('returns correct rules for en locale', () => {
      const rules = getPersonaRules('playful', 'en');

      expect(rules).toEqual({
        theme: 'playful',
        pronounSelf: 'I',
        pronounUser: 'you',
        maxWordsPerSentence: 15,
        emojiRange: [1, 2],
        vocabularyLevel: 'everyday',
        allowMedicalTerms: false,
      });
    });
  });

  describe('hybrid theme', () => {
    it('returns correct rules for id locale', () => {
      const rules = getPersonaRules('hybrid', 'id');

      expect(rules).toEqual({
        theme: 'hybrid',
        pronounSelf: 'Saya',
        pronounUser: 'kamu',
        maxWordsPerSentence: 25,
        emojiRange: [0, 1],
        vocabularyLevel: 'semi-formal',
        allowMedicalTerms: true,
      });
    });

    it('returns correct rules for en locale', () => {
      const rules = getPersonaRules('hybrid', 'en');

      expect(rules).toEqual({
        theme: 'hybrid',
        pronounSelf: 'I',
        pronounUser: 'you',
        maxWordsPerSentence: 25,
        emojiRange: [0, 1],
        vocabularyLevel: 'semi-formal',
        allowMedicalTerms: true,
      });
    });
  });

  it('returns PersonaRules with theme field matching input theme', () => {
    const themes: Theme[] = ['playful', 'hybrid'];
    const locales: SupportedLocale[] = ['id', 'en'];

    for (const theme of themes) {
      for (const locale of locales) {
        const rules = getPersonaRules(theme, locale);
        expect(rules.theme).toBe(theme);
      }
    }
  });

  it('always sets emojiRange as a tuple of two numbers', () => {
    const themes: Theme[] = ['playful', 'hybrid'];
    const locales: SupportedLocale[] = ['id', 'en'];

    for (const theme of themes) {
      for (const locale of locales) {
        const rules = getPersonaRules(theme, locale);
        expect(rules.emojiRange).toHaveLength(2);
        expect(rules.emojiRange[0]).toBeLessThanOrEqual(rules.emojiRange[1]);
      }
    }
  });
});
