import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeUserInput, stripHtmlContent } from './sanitize';

/**
 * Property-based tests for input sanitization functions.
 *
 * Validates: Requirements 9.1, 9.3, 9.6
 */

// ─── Arbitraries ───

/**
 * Generate strings that are "safe" for round-trip identity:
 * - Medical terminology, numbers, and standard punctuation
 * - No HTML tags (no angle brackets)
 * - No control characters
 * - No zero-width characters
 * - No HTML entity sequences that would be decoded
 * - Already trimmed, NFC normalized, no excessive newlines
 */
const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SAFE_PUNCTUATION = '.,?!-:;\'"()[] ';
const MEDICAL_TERMS = [
  'scabies',
  'gatal',
  'kulit',
  'sarcoptes',
  'infeksi',
  'diagnosis',
  'pruritus',
  'papules',
  'burrow',
  'mite',
  'dermatitis',
  'eczema',
  'symptoms',
  'treatment',
  'permethrin',
  'ivermectin',
  'skabies',
  'skrining',
  'santri',
  'pesantren',
];

/** Arbitrary for safe words: letters, digits, common punctuation */
const safeWordArb = fc
  .array(fc.constantFrom(...(SAFE_CHARS + SAFE_PUNCTUATION).split('')), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(''));

/** Arbitrary for medical-style content (words, numbers, punctuation, no HTML) */
const medicalContentArb = fc
  .tuple(
    fc.array(
      fc.oneof(
        fc.constantFrom(...MEDICAL_TERMS),
        safeWordArb,
        fc.integer({ min: 1, max: 999 }).map(String),
      ),
      { minLength: 1, maxLength: 8 },
    ),
  )
  .map(([parts]) => parts.join(' ').normalize('NFC').trim())
  .filter((s) => s.length > 0 && !s.includes('\n\n\n'));

/**
 * Arbitrary for strings containing HTML tags.
 * Generates a variety of tag patterns: simple, nested, self-closing, malformed.
 */
const htmlTagNames = ['div', 'span', 'p', 'b', 'i', 'script', 'style', 'a', 'img', 'br', 'hr'];

const simpleTagArb = fc.constantFrom(...htmlTagNames).map((tag) => `<${tag}>content</${tag}>`);

const selfClosingTagArb = fc.constantFrom(...htmlTagNames).map((tag) => `<${tag}/>`);

const tagWithAttrsArb = fc
  .tuple(fc.constantFrom(...htmlTagNames), fc.lorem({ maxCount: 1 }))
  .map(([tag, attr]) => `<${tag} class="${attr}">inside</${tag}>`);

const malformedTagArb = fc.oneof(
  fc.constant('<unclosed'),
  fc.constant('<>'),
  fc.constantFrom(...htmlTagNames).map((tag) => `<${tag} broken`),
  fc.constant('< spaced >'),
);

const nestedTagArb = fc
  .tuple(fc.constantFrom(...htmlTagNames), fc.constantFrom(...htmlTagNames))
  .map(([outer, inner]) => `<${outer}><${inner}>nested</${inner}></${outer}>`);

const htmlStringArb = fc
  .array(
    fc.oneof(
      simpleTagArb,
      selfClosingTagArb,
      tagWithAttrsArb,
      malformedTagArb,
      nestedTagArb,
      fc.lorem({ maxCount: 2 }),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((parts) => parts.join(' '));

/**
 * Arbitrary for whitespace-only strings:
 * spaces, tabs, newlines, zero-width characters.
 */
const whitespaceChars = [
  ' ',
  '\t',
  '\n',
  '\u200B', // zero-width space
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
  '\u2028', // line separator
  '\u2029', // paragraph separator
  '\uFEFF', // BOM / zero-width no-break space
  '\u202A', // left-to-right embedding
  '\u202B', // right-to-left embedding
  '\u202C', // pop directional formatting
  '\u202D', // left-to-right override
  '\u202E', // right-to-left override
  '\u202F', // narrow no-break space
];

const whitespaceOnlyArb = fc
  .array(fc.constantFrom(...whitespaceChars), { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(''));

// ─── Property Tests ───

// Feature: screening-api, Property 1: Input sanitization round-trip preserves semantic content
describe('Feature: screening-api, Property 1: Input sanitization round-trip preserves semantic content', () => {
  it('sanitizeUserInput then stripHtmlContent returns identity for safe content', () => {
    fc.assert(
      fc.property(medicalContentArb, (input) => {
        const expected = input.normalize('NFC').trim();
        const result = stripHtmlContent(sanitizeUserInput(input));

        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves medical terminology through the full pipeline', () => {
    fc.assert(
      fc.property(fc.constantFrom(...MEDICAL_TERMS), (term) => {
        const result = stripHtmlContent(sanitizeUserInput(term));
        expect(result).toBe(term);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves numbers and punctuation through the full pipeline', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 0, max: 9999 }), fc.constantFrom('.', ',', '?', '!', '-', ':')),
        ([num, punct]) => {
          const input = `${num}${punct}`;
          const result = stripHtmlContent(sanitizeUserInput(input));
          expect(result).toBe(input);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: screening-api, Property 2: HTML stripping removes all tags
describe('Feature: screening-api, Property 2: HTML stripping removes all tags', () => {
  it('stripHtmlContent output contains no HTML tags', () => {
    fc.assert(
      fc.property(htmlStringArb, (input) => {
        const result = stripHtmlContent(input);
        const tagPattern = /<[^>]*>/;

        expect(result).not.toMatch(tagPattern);
      }),
      { numRuns: 100 },
    );
  });

  it('stripHtmlContent removes script blocks completely', () => {
    fc.assert(
      fc.property(fc.lorem({ maxCount: 3 }), (scriptContent) => {
        const input = `before<script>${scriptContent}</script>after`;
        const result = stripHtmlContent(input);

        expect(result).not.toContain('<script');
        expect(result).not.toContain('</script');
        expect(result).toContain('before');
        expect(result).toContain('after');
      }),
      { numRuns: 100 },
    );
  });

  it('stripHtmlContent removes style blocks completely', () => {
    fc.assert(
      fc.property(fc.lorem({ maxCount: 3 }), (styleContent) => {
        const input = `text<style>${styleContent}</style>more`;
        const result = stripHtmlContent(input);

        expect(result).not.toContain('<style');
        expect(result).not.toContain('</style');
        expect(result).toContain('text');
        expect(result).toContain('more');
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: screening-api, Property 10: Post-sanitization empty check
describe('Feature: screening-api, Property 10: Post-sanitization empty check', () => {
  it('whitespace-only input produces empty string after full pipeline', () => {
    fc.assert(
      fc.property(whitespaceOnlyArb, (input) => {
        const sanitized = sanitizeUserInput(input);
        const stripped = stripHtmlContent(sanitized);
        const result = stripped.trim();

        expect(result).toBe('');
      }),
      { numRuns: 100 },
    );
  });

  it('empty string produces empty string after full pipeline', () => {
    const sanitized = sanitizeUserInput('');
    const stripped = stripHtmlContent(sanitized);
    const result = stripped.trim();

    expect(result).toBe('');
  });

  it('zero-width characters only produce empty string after pipeline', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\uFEFF'), {
          minLength: 1,
          maxLength: 20,
        }),
        (chars) => {
          const input = chars.join('');
          const sanitized = sanitizeUserInput(input);
          const stripped = stripHtmlContent(sanitized);
          const result = stripped.trim();

          expect(result).toBe('');
        },
      ),
      { numRuns: 100 },
    );
  });
});
