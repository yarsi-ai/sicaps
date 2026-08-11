import { describe, it, expect } from 'vitest';
import { getOpeningMessage } from './opening';
import type { Theme } from '../types';
import type { SupportedLocale } from '../config';

describe('getOpeningMessage', () => {
  const themes: Theme[] = ['playful', 'hybrid'];
  const locales: SupportedLocale[] = ['id', 'en'];

  it('returns a string for every theme-locale combination', () => {
    for (const theme of themes) {
      for (const locale of locales) {
        const result = getOpeningMessage(theme, locale);
        expect(result).toBeTypeOf('string');
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });

  describe('playful-id template', () => {
    const message = getOpeningMessage('playful', 'id');

    it('uses "Aku" pronoun', () => {
      expect(message).toMatch(/\bAku\b/);
    });

    it('contains at least 1 emoji', () => {
      const emojiPattern = /\p{Emoji_Presentation}/u;
      expect(emojiPattern.test(message)).toBe(true);
    });

    it('invites user to describe skin complaint', () => {
      expect(message.toLowerCase()).toMatch(/kulit/);
    });
  });

  describe('playful-en template', () => {
    const message = getOpeningMessage('playful', 'en');

    it('uses "I" pronoun', () => {
      expect(message).toMatch(/\bI'm\b|\bI\b/);
    });

    it('contains at least 1 emoji', () => {
      const emojiPattern = /\p{Emoji_Presentation}/u;
      expect(emojiPattern.test(message)).toBe(true);
    });

    it('invites user to describe skin complaint', () => {
      expect(message.toLowerCase()).toMatch(/skin/);
    });
  });

  describe('hybrid-id template', () => {
    const message = getOpeningMessage('hybrid', 'id');

    it('uses "Saya" pronoun', () => {
      expect(message).toMatch(/\bSaya\b/);
    });

    it('contains at most 1 emoji', () => {
      const emojiMatches = message.match(/\p{Emoji_Presentation}/gu) ?? [];
      expect(emojiMatches.length).toBeLessThanOrEqual(1);
    });

    it('invites user to describe skin complaint', () => {
      expect(message.toLowerCase()).toMatch(/kulit/);
    });
  });

  describe('hybrid-en template', () => {
    const message = getOpeningMessage('hybrid', 'en');

    it('uses "I" pronoun', () => {
      expect(message).toMatch(/\bI\b/);
    });

    it('contains at most 1 emoji', () => {
      const emojiMatches = message.match(/\p{Emoji_Presentation}/gu) ?? [];
      expect(emojiMatches.length).toBeLessThanOrEqual(1);
    });

    it('invites user to describe skin complaint', () => {
      expect(message.toLowerCase()).toMatch(/skin/);
    });
  });

  it('produces exactly 4 distinct messages', () => {
    const messages = new Set<string>();
    for (const theme of themes) {
      for (const locale of locales) {
        messages.add(getOpeningMessage(theme, locale));
      }
    }
    expect(messages.size).toBe(4);
  });
});
