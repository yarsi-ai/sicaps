import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalize } from './normalize';

describe('normalize', () => {
  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 1.6**
     * P1: Idempotence — normalizing twice yields same result as normalizing once.
     */
    it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const once = normalize(input);
          const twice = normalize(once);
          expect(twice).toBe(once);
        }),
      );
    });

    /**
     * **Validates: Requirements 1.5**
     * P11: Empty and whitespace-only strings normalize to empty string.
     */
    it('returns empty string for empty input', () => {
      expect(normalize('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      fc.assert(
        fc.property(
          fc
            .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
            .map((chars) => chars.join('')),
          (whitespace) => {
            expect(normalize(whitespace)).toBe('');
          },
        ),
      );
    });
  });

  describe('lowercase conversion', () => {
    /**
     * **Validates: Requirements 1.1**
     */
    it('converts to lowercase', () => {
      expect(normalize('GATAL BANGET')).toBe('gatal banget');
    });

    it('handles mixed case', () => {
      expect(normalize('Gatal Banget')).toBe('gatal banget');
    });
  });

  describe('whitespace trimming', () => {
    /**
     * **Validates: Requirements 1.2**
     */
    it('trims leading and trailing whitespace', () => {
      expect(normalize('  gatal  ')).toBe('gatal');
    });
  });

  describe('whitespace collapsing', () => {
    /**
     * **Validates: Requirements 1.3**
     */
    it('collapses multiple spaces into a single space', () => {
      expect(normalize('gatal   banget')).toBe('gatal banget');
    });

    it('collapses mixed whitespace characters', () => {
      expect(normalize('gatal\t\n  banget')).toBe('gatal banget');
    });
  });

  describe('trailing punctuation stripping', () => {
    /**
     * **Validates: Requirements 1.4**
     */
    it('strips trailing period', () => {
      expect(normalize('gatal.')).toBe('gatal');
    });

    it('strips trailing exclamation mark', () => {
      expect(normalize('gatal!')).toBe('gatal');
    });

    it('strips trailing question mark', () => {
      expect(normalize('gatal?')).toBe('gatal');
    });

    it('strips trailing semicolon', () => {
      expect(normalize('gatal;')).toBe('gatal');
    });

    it('strips trailing colon', () => {
      expect(normalize('gatal:')).toBe('gatal');
    });

    it('strips multiple trailing punctuation characters', () => {
      expect(normalize('gatal!!')).toBe('gatal');
    });
  });

  describe('mid-word and non-trailing punctuation preservation', () => {
    /**
     * **Validates: Requirements 1.4 (inverse — does NOT strip mid-word)**
     */
    it('preserves mid-word punctuation', () => {
      expect(normalize("it's fine")).toBe("it's fine");
    });

    it('preserves hyphenated words', () => {
      expect(normalize('merah-merah')).toBe('merah-merah');
    });

    it('preserves punctuation followed by text', () => {
      expect(normalize('a.b.c')).toBe('a.b.c');
    });

    it('preserves slashes in patterns', () => {
      expect(normalize('sela jari/pergelangan')).toBe('sela jari/pergelangan');
    });
  });

  describe('combined normalization', () => {
    it('applies all steps together', () => {
      expect(normalize('  GATAL   BANGET!  ')).toBe('gatal banget');
    });

    it('handles string that is only punctuation after trim', () => {
      expect(normalize('!!!')).toBe('');
    });
  });
});
