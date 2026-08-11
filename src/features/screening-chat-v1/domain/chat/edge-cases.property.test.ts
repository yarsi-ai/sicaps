import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectEdgeCase } from './edge-cases';
import type { CategoryExtraction } from '../keywords/types';
import type { SessionContext } from '../types';

/**
 * Property-based tests for edge case detection.
 *
 * Property 16: Short answer detection
 * Property 17: Consecutive short answer advancement
 * Property 18: Off-topic detection and counter
 * Property 20: Long message threshold
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6
 */

// ─── Arbitraries ───

/** Base session context for use in property tests */
function baseContextArb(overrides: Partial<SessionContext> = {}): fc.Arbitrary<SessionContext> {
  return fc
    .record({
      sessionId: fc.uuid(),
      state: fc.constant('CHATTING' as const),
      theme: fc.constantFrom('playful' as const, 'hybrid' as const),
      locale: fc.constantFrom('id' as const, 'en' as const),
      turn: fc.integer({ min: 1, max: 7 }),
      categoriesCovered: fc.constant([] as SessionContext['categoriesCovered']),
      categoriesFollowedUp: fc.constant([] as SessionContext['categoriesFollowedUp']),
      followUpTarget: fc.constant(null),
      offTopicCount: fc.constant(overrides.offTopicCount ?? 0),
      shortAnswerCount: fc.constant(overrides.shortAnswerCount ?? 0),
    })
    .map((ctx) => ({ ...ctx, ...overrides }));
}

/** Generate a non-empty word (no whitespace) */
const wordArb = fc
  .array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(''));

/** Generate a short message: 0 to 2 words */
const shortMessageArb = fc.integer({ min: 0, max: 2 }).chain((wordCount) => {
  if (wordCount === 0) return fc.constant('');
  return fc
    .array(wordArb, { minLength: wordCount, maxLength: wordCount })
    .map((words) => words.join(' '));
});

/** Generate a medium-length message: 3 to 100 words (not short, not long) */
const mediumMessageArb = fc
  .integer({ min: 3, max: 100 })
  .chain((wordCount) =>
    fc
      .array(wordArb, { minLength: wordCount, maxLength: wordCount })
      .map((words) => words.join(' ')),
  );

/** Generate a long message: 101+ words */
const longMessageArb = fc
  .integer({ min: 101, max: 150 })
  .chain((wordCount) =>
    fc
      .array(wordArb, { minLength: wordCount, maxLength: wordCount })
      .map((words) => words.join(' ')),
  );

/** Generate an extraction with NO keywords across all categories (empty arrays) */
const emptyExtractionArb: fc.Arbitrary<CategoryExtraction> = fc.constant({
  intensitas: [],
  waktu: [],
  lokasi_tubuh: [],
  kontak: [],
  lesi: [],
  faktor_risiko: [],
});

/** Generate an extraction with NO medium/high confidence keywords (only low or empty) */
const noSignificantExtractionArb: fc.Arbitrary<CategoryExtraction> = fc.constant({
  intensitas: [],
  waktu: [],
  lokasi_tubuh: [],
  kontak: [],
  lesi: [],
  faktor_risiko: [],
});

/** Generate an extraction with at least one keyword in some category (for non-off-topic) */
const nonEmptyExtractionArb: fc.Arbitrary<CategoryExtraction> = fc
  .constantFrom('intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko')
  .chain((category) =>
    fc.record({
      intensitas: fc.constant(
        category === 'intensitas' ? [{ keyword: 'gatal', confidence: 'low' as const }] : [],
      ),
      waktu: fc.constant(
        category === 'waktu' ? [{ keyword: 'seminggu', confidence: 'low' as const }] : [],
      ),
      lokasi_tubuh: fc.constant(
        category === 'lokasi_tubuh' ? [{ keyword: 'tangan', confidence: 'low' as const }] : [],
      ),
      kontak: fc.constant(
        category === 'kontak' ? [{ keyword: 'teman', confidence: 'low' as const }] : [],
      ),
      lesi: fc.constant(
        category === 'lesi' ? [{ keyword: 'bentol', confidence: 'low' as const }] : [],
      ),
      faktor_risiko: fc.constant(
        category === 'faktor_risiko' ? [{ keyword: 'asrama', confidence: 'low' as const }] : [],
      ),
    }),
  );

// ─── Property 16: Short answer detection ───

describe('Feature: ai-chat-bot, Property 16: Short answer detection', () => {
  /**
   * Validates: Requirements 10.1
   *
   * For any user message containing 2 words or fewer where the extraction yields
   * no keywords at confidence 'medium' or 'high', detectEdgeCase SHALL return
   * type 'short_answer' with an instruction of type 'SHORT_ANSWER_FOLLOW_UP'.
   */
  it('returns short_answer with SHORT_ANSWER_FOLLOW_UP for short messages with no significant extraction', () => {
    fc.assert(
      fc.property(
        shortMessageArb,
        noSignificantExtractionArb,
        baseContextArb({ shortAnswerCount: 0 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('short_answer');
          expect(result.instruction).toBeDefined();
          expect(result.instruction!.type).toBe('SHORT_ANSWER_FOLLOW_UP');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns short_answer when extraction is null (first short answer)', () => {
    fc.assert(
      fc.property(shortMessageArb, baseContextArb({ shortAnswerCount: 0 }), (message, context) => {
        const result = detectEdgeCase(message, null, context);

        expect(result.type).toBe('short_answer');
        expect(result.instruction).toBeDefined();
        expect(result.instruction!.type).toBe('SHORT_ANSWER_FOLLOW_UP');
      }),
      { numRuns: 100 },
    );
  });

  it('does NOT return short_answer when message has more than 2 words', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        emptyExtractionArb,
        baseContextArb({ shortAnswerCount: 0 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          // Should be off_topic (zero keywords, >2 words) — NOT short_answer
          expect(result.type).not.toBe('short_answer');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 17: Consecutive short answer advancement ───

describe('Feature: ai-chat-bot, Property 17: Consecutive short answer advancement', () => {
  /**
   * Validates: Requirements 10.2
   *
   * For any session context where shortAnswerCount is already 1 and the current
   * message is again a short answer with no extractable medium/high keywords,
   * detectEdgeCase SHALL return shouldAdvance: true.
   */
  it('returns shouldAdvance: true when shortAnswerCount >= 1 and message is a short answer', () => {
    fc.assert(
      fc.property(
        shortMessageArb,
        noSignificantExtractionArb,
        baseContextArb({ shortAnswerCount: 1 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('short_answer');
          expect(result.shouldAdvance).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns shouldAdvance: true with null extraction on consecutive short answer', () => {
    fc.assert(
      fc.property(shortMessageArb, baseContextArb({ shortAnswerCount: 1 }), (message, context) => {
        const result = detectEdgeCase(message, null, context);

        expect(result.type).toBe('short_answer');
        expect(result.shouldAdvance).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns shouldAdvance: true for any shortAnswerCount > 1 as well', () => {
    fc.assert(
      fc.property(
        shortMessageArb,
        noSignificantExtractionArb,
        fc
          .integer({ min: 2, max: 5 })
          .chain((count) => baseContextArb({ shortAnswerCount: count })),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('short_answer');
          expect(result.shouldAdvance).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 18: Off-topic detection and counter ───

describe('Feature: ai-chat-bot, Property 18: Off-topic detection and counter', () => {
  /**
   * Validates: Requirements 10.3, 10.4
   *
   * For any user message where the extraction yields zero keywords across all 6
   * categories (and message >2 words), detectEdgeCase SHALL return type 'off_topic'.
   * When offTopicCount reaches 2+, the instruction type SHALL be 'SESSION_CLOSE_OFFER'.
   */
  it('returns off_topic for messages >2 words with zero keywords in extraction', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        emptyExtractionArb,
        baseContextArb({ offTopicCount: 0 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('off_topic');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns off_topic with null extraction for messages >2 words', () => {
    fc.assert(
      fc.property(mediumMessageArb, baseContextArb({ offTopicCount: 0 }), (message, context) => {
        const result = detectEdgeCase(message, null, context);

        expect(result.type).toBe('off_topic');
      }),
      { numRuns: 100 },
    );
  });

  it('returns SESSION_CLOSE_OFFER when offTopicCount is 2 or more', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        emptyExtractionArb,
        fc.integer({ min: 2, max: 5 }).chain((count) => baseContextArb({ offTopicCount: count })),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('off_topic');
          expect(result.instruction).toBeDefined();
          expect(result.instruction!.type).toBe('SESSION_CLOSE_OFFER');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns REDIRECT_ON_TOPIC when offTopicCount < 2', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        emptyExtractionArb,
        fc.integer({ min: 0, max: 1 }).chain((count) => baseContextArb({ offTopicCount: count })),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('off_topic');
          expect(result.instruction).toBeDefined();
          expect(result.instruction!.type).toBe('REDIRECT_ON_TOPIC');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT return off_topic when extraction has at least one keyword', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        nonEmptyExtractionArb,
        baseContextArb({ offTopicCount: 0 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).not.toBe('off_topic');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 20: Long message threshold ───

describe('Feature: ai-chat-bot, Property 20: Long message threshold', () => {
  /**
   * Validates: Requirements 10.6
   *
   * For any user message exceeding 100 words, detectEdgeCase SHALL return type
   * 'long_message' with instruction type 'LONG_MESSAGE_CONFIRM'.
   * For any message of 100 words or fewer, it SHALL NOT trigger the long message handling.
   */
  it('returns long_message with LONG_MESSAGE_CONFIRM for messages >100 words', () => {
    fc.assert(
      fc.property(
        longMessageArb,
        emptyExtractionArb,
        baseContextArb(),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).toBe('long_message');
          expect(result.instruction).toBeDefined();
          expect(result.instruction!.type).toBe('LONG_MESSAGE_CONFIRM');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns long_message regardless of extraction content', () => {
    fc.assert(
      fc.property(
        longMessageArb,
        nonEmptyExtractionArb,
        baseContextArb(),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          // Long message check has highest priority
          expect(result.type).toBe('long_message');
          expect(result.instruction).toBeDefined();
          expect(result.instruction!.type).toBe('LONG_MESSAGE_CONFIRM');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns long_message regardless of context counters', () => {
    fc.assert(
      fc.property(
        longMessageArb,
        emptyExtractionArb,
        baseContextArb({ shortAnswerCount: 1, offTopicCount: 3 }),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          // Long message takes priority over everything
          expect(result.type).toBe('long_message');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT return long_message for messages of 100 words or fewer', () => {
    fc.assert(
      fc.property(
        mediumMessageArb,
        emptyExtractionArb,
        baseContextArb(),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).not.toBe('long_message');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT return long_message for short messages', () => {
    fc.assert(
      fc.property(
        shortMessageArb,
        emptyExtractionArb,
        baseContextArb(),
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);

          expect(result.type).not.toBe('long_message');
        },
      ),
      { numRuns: 100 },
    );
  });
});
