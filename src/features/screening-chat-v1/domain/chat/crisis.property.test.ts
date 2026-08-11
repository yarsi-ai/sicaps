import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkCrisis } from './crisis';

/**
 * Property-based tests for crisis keyword detection.
 *
 * Property 19: Crisis keyword detection
 * Validates: Requirements 10.5
 *
 * For any user message containing at least one entry from the crisis keyword list,
 * checkCrisis SHALL return a CrisisInstruction with helpline numbers and
 * terminateSession: true.
 *
 * For any message not containing any crisis keyword, checkCrisis SHALL return null.
 */

// ─── Crisis Keywords (mirrored from crisis.ts for test assertions) ───

const CRISIS_KEYWORDS_ID = [
  'bunuh diri',
  'mati saja',
  'tidak mau hidup',
  'menyakiti diri',
  'ingin mati',
  'mau mati',
  'akhiri hidup',
  'gantung diri',
] as const;

const CRISIS_KEYWORDS_EN = [
  'kill myself',
  'want to die',
  'self-harm',
  'end my life',
  'suicide',
  'hurt myself',
  'take my own life',
  'end it all',
] as const;

const ALL_CRISIS_KEYWORDS = [...CRISIS_KEYWORDS_ID, ...CRISIS_KEYWORDS_EN];

// ─── Arbitraries ───

/** Pick a random locale */
const localeArb = fc.constantFrom('id' as const, 'en' as const);

/** Pick a random crisis keyword from the combined list */
const crisisKeywordArb = fc.constantFrom(...ALL_CRISIS_KEYWORDS);

/**
 * Generate surrounding text that is safe (won't accidentally contain a crisis keyword).
 * Uses a restricted alphabet of characters that cannot form crisis keywords.
 */
const SAFE_CHARS = ['a', 'b', 'c', 'j', 'p', 'q', 'v', 'w', 'x', 'z', '0', '1', '2', '3'] as const;

const safeWordArb = fc
  .array(fc.constantFrom(...SAFE_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''));

/** Generate a safe sentence fragment (space-separated safe words) */
const safePrefixArb = fc
  .array(safeWordArb, { minLength: 0, maxLength: 4 })
  .map((words) => words.join(' '));

const safeSuffixArb = fc
  .array(safeWordArb, { minLength: 0, maxLength: 4 })
  .map((words) => words.join(' '));

/**
 * Generate a message that CONTAINS a crisis keyword embedded in safe surrounding text.
 * The keyword is sandwiched between safe prefix and suffix.
 */
const messageWithCrisisKeywordArb = fc
  .tuple(safePrefixArb, crisisKeywordArb, safeSuffixArb)
  .map(([prefix, keyword, suffix]) => {
    const parts = [prefix, keyword, suffix].filter((p) => p.length > 0);
    return parts.join(' ');
  });

/**
 * Generate a message that does NOT contain any crisis keyword.
 * Strategy: use only characters from a restricted safe alphabet that
 * cannot form any of the crisis keywords via substring matching.
 *
 * The safe alphabet excludes characters needed to form crisis keywords,
 * ensuring no generated string can accidentally contain one.
 */
const safeMessageArb = fc
  .array(safeWordArb, { minLength: 1, maxLength: 10 })
  .map((words) => words.join(' '));

// ─── Property Tests ───

describe('Feature: ai-chat-bot, Property 19: Crisis keyword detection', () => {
  it('returns CrisisInstruction for any message containing a crisis keyword', () => {
    fc.assert(
      fc.property(messageWithCrisisKeywordArb, localeArb, (message, locale) => {
        const result = checkCrisis(message, locale);

        // Must not be null
        expect(result).not.toBeNull();

        // Must have correct structure
        expect(result!.type).toBe('CRISIS_HALT');
        expect(result!.helplineNumbers).toEqual({
          id: '119',
          international: '988',
        });
        expect(result!.terminateSession).toBe(true);

        // Message must be a non-empty string
        expect(typeof result!.message).toBe('string');
        expect(result!.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('returns locale-appropriate message content', () => {
    fc.assert(
      fc.property(messageWithCrisisKeywordArb, localeArb, (message, locale) => {
        const result = checkCrisis(message, locale);

        expect(result).not.toBeNull();

        if (locale === 'id') {
          expect(result!.message).toContain('Kami mendeteksi');
        } else {
          expect(result!.message).toContain('We detected');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for any message not containing a crisis keyword', () => {
    fc.assert(
      fc.property(safeMessageArb, localeArb, (message, locale) => {
        // Pre-condition: verify message doesn't contain any keyword
        const normalized = message.toLowerCase().trim();
        const containsKeyword = ALL_CRISIS_KEYWORDS.some((kw) => normalized.includes(kw));
        expect(containsKeyword).toBe(false);

        const result = checkCrisis(message, locale);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('detects crisis keywords regardless of case', () => {
    fc.assert(
      fc.property(
        crisisKeywordArb,
        localeArb,
        fc.constantFrom('upper', 'lower', 'mixed'),
        (keyword, locale, caseType) => {
          let transformed: string;
          if (caseType === 'upper') {
            transformed = keyword.toUpperCase();
          } else if (caseType === 'lower') {
            transformed = keyword.toLowerCase();
          } else {
            // Mixed case: alternate upper/lower per character
            transformed = keyword
              .split('')
              .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
              .join('');
          }

          const result = checkCrisis(transformed, locale);
          expect(result).not.toBeNull();
          expect(result!.type).toBe('CRISIS_HALT');
          expect(result!.terminateSession).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checks both locale keyword lists regardless of passed locale', () => {
    fc.assert(
      fc.property(crisisKeywordArb, localeArb, (keyword, locale) => {
        // Any keyword from either list should be detected regardless of locale param
        const result = checkCrisis(keyword, locale);
        expect(result).not.toBeNull();
        expect(result!.type).toBe('CRISIS_HALT');
        expect(result!.terminateSession).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
