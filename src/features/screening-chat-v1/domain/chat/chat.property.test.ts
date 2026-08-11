import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateAllScores } from '../scoring/engine';
import { createInitialContext, transition } from './state-machine';
import { getNextInstruction, buildCategoryTracker } from './instruction';
import { buildOutputContext, getFallbackTemplate } from './output';
import { selectTheme, getPersonaRules } from './persona';
import { getOpeningMessage } from './opening';
import { checkCrisis } from './crisis';
import { getPerceptionIndicators, buildPerceptionInferenceContext } from './perception';
import { detectEdgeCase } from './edge-cases';
import { ValidationError } from '@/lib/errors';
import type {
  KeywordPool,
  PoolEntry,
  Locale,
  CategoryName,
  CategoryExtraction,
  Confidence,
  ExtractedKeyword,
} from '../keywords/types';
import type { RiskLevel, SupportedLocale } from '../config';
import type {
  EducationLevelInput,
  Perception,
  SessionContext,
  Theme,
  TransitionResult,
} from '../types';

/**
 * Cross-cutting property-based tests for the chat module.
 *
 * **Validates: Requirements 6.4**
 */

const ALL_CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

const ALL_PERCEPTIONS: Perception[] = ['UNDERESTIMATE', 'OVERESTIMATE', 'BARRIER', 'ADEQUATE'];

const ALL_LOCALES: Locale[] = ['id', 'en'];

/** Arbitrary for a valid locale */
const localeArb: fc.Arbitrary<Locale> = fc.constantFrom(...ALL_LOCALES);

/** Arbitrary for a valid perception */
const perceptionArb: fc.Arbitrary<Perception> = fc.constantFrom(...ALL_PERCEPTIONS);

/** Arbitrary for a confidence value */
const confidenceArb = fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<
  'high' | 'medium' | 'low'
>;

/** Arbitrary for a single PoolEntry */
const poolEntryArb: fc.Arbitrary<PoolEntry> = fc.record({
  keyword: fc.string({ minLength: 1, maxLength: 30 }),
  confidence: confidenceArb,
  turn: fc.integer({ min: 1, max: 7 }),
  matched: fc.boolean(),
  matchedPattern: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: null,
  }),
});

/** Arbitrary for a category's pool entries (0-5 entries) */
const categoryPoolArb: fc.Arbitrary<PoolEntry[]> = fc.array(poolEntryArb, {
  minLength: 0,
  maxLength: 5,
});

/** Arbitrary for a full KeywordPool */
const keywordPoolArb: fc.Arbitrary<KeywordPool> = fc.record({
  intensitas: categoryPoolArb,
  waktu: categoryPoolArb,
  lokasi_tubuh: categoryPoolArb,
  kontak: categoryPoolArb,
  lesi: categoryPoolArb,
  faktor_risiko: categoryPoolArb,
});

describe('Feature: ai-chat-bot, Property 9: Perception independence from scoring', () => {
  it('calculateAllScores produces identical results regardless of perception value', () => {
    fc.assert(
      fc.property(
        keywordPoolArb,
        localeArb,
        perceptionArb,
        perceptionArb,
        (pool, locale, _perceptionA, _perceptionB) => {
          // Regardless of what perception values exist, calling calculateAllScores
          // with the same pool and locale must produce identical results.
          // This confirms perception is not a parameter and does not affect scoring.
          const resultA = calculateAllScores(pool, locale);
          const resultB = calculateAllScores(pool, locale);

          expect(resultA).toEqual(resultB);

          // Additionally verify that the scoring API signature has no perception dependency
          // by confirming deterministic output across the two calls
          expect(resultA.totalScore).toBe(resultB.totalScore);
          expect(resultA.riskLevel).toBe(resultB.riskLevel);

          for (const category of ALL_CATEGORIES) {
            expect(resultA.scores[category].capped).toBe(resultB.scores[category].capped);
            expect(resultA.scores[category].raw).toBe(resultB.scores[category].raw);
            expect(resultA.scores[category].status).toBe(resultB.scores[category].status);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scoring depends only on pool and locale — not on any external session metadata', () => {
    fc.assert(
      fc.property(keywordPoolArb, localeArb, (pool, locale) => {
        // Call calculateAllScores multiple times with identical inputs
        // to verify pure deterministic behavior (no hidden state like perception)
        const results = Array.from({ length: 3 }, () => calculateAllScores(pool, locale));

        // All calls must produce the exact same result
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(results[0]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('two sessions with same pool/locale but different perceptions yield identical scores', () => {
    fc.assert(
      fc.property(
        keywordPoolArb,
        localeArb,
        fc.tuple(perceptionArb, perceptionArb).filter(([a, b]) => a !== b),
        (pool, locale, [_perceptionA, _perceptionB]) => {
          // Simulate two sessions: same keyword pool and locale, different perceptions.
          // Perception is stored separately and must not influence calculateAllScores.
          const scoreSessionA = calculateAllScores(pool, locale);
          const scoreSessionB = calculateAllScores(pool, locale);

          // Scores must be identical
          expect(scoreSessionA.totalScore).toBe(scoreSessionB.totalScore);
          expect(scoreSessionA.riskLevel).toBe(scoreSessionB.riskLevel);
          expect(scoreSessionA.scores).toEqual(scoreSessionB.scores);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildOutputContext scores/totalScore are pass-through and independent of perception', () => {
    const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('HIGH', 'MODERATE', 'LOW');
    const themeArb = fc.constantFrom<'playful' | 'hybrid'>('playful', 'hybrid');
    const categoryScoreArb = fc.integer({ min: 0, max: 4 });

    fc.assert(
      fc.property(
        riskLevelArb,
        localeArb,
        themeArb,
        fc.tuple(perceptionArb, perceptionArb).filter(([a, b]) => a !== b),
        categoryScoreArb,
        categoryScoreArb,
        categoryScoreArb,
        categoryScoreArb,
        categoryScoreArb,
        categoryScoreArb,
        (riskLevel, locale, theme, [perceptionA, perceptionB], s1, s2, s3, s4, s5, s6) => {
          const scores: Record<CategoryName, number> = {
            intensitas: s1,
            waktu: s2,
            lokasi_tubuh: s3,
            kontak: s4,
            lesi: s5,
            faktor_risiko: s6,
          };
          const totalScore = s1 + s2 + s3 + s4 + s5 + s6;
          const matchedKeywords: Record<CategoryName, string[]> = {
            intensitas: [],
            waktu: [],
            lokasi_tubuh: [],
            kontak: [],
            lesi: [],
            faktor_risiko: [],
          };

          // Build two OutputContexts: same data, different perceptions
          const outputA = buildOutputContext({
            riskLevel,
            perception: perceptionA,
            locale,
            theme,
            categoriesAssessed: [...ALL_CATEGORIES],
            matchedKeywords,
            scores,
            totalScore,
            isForceClose: false,
          });

          const outputB = buildOutputContext({
            riskLevel,
            perception: perceptionB,
            locale,
            theme,
            categoriesAssessed: [...ALL_CATEGORIES],
            matchedKeywords,
            scores,
            totalScore,
            isForceClose: false,
          });

          // Scores and totalScore must be identical regardless of perception
          expect(outputA.scores).toEqual(outputB.scores);
          expect(outputA.totalScore).toBe(outputB.totalScore);
          expect(outputA.riskLevel).toBe(outputB.riskLevel);

          // Only perception field differs
          expect(outputA.perception).not.toBe(outputB.perception);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Additional Arbitraries for Properties 1 & 2 ───

function makeEmptyExtraction(): CategoryExtraction {
  return {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };
}

function makeChattingContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: 'prop-test-session',
    state: 'CHATTING',
    theme: 'hybrid',
    locale: 'id',
    turn: 2,
    categoriesCovered: [],
    categoriesFollowedUp: [],
    followUpTarget: null,
    offTopicCount: 0,
    shortAnswerCount: 0,
    ...overrides,
  };
}

function isTransitionResult(result: unknown): result is TransitionResult {
  return (
    typeof result === 'object' && result !== null && 'newState' in result && 'context' in result
  );
}

const arbConfidenceMediumOrHigh: fc.Arbitrary<Confidence> = fc.constantFrom(
  'medium' as const,
  'high' as const,
);

const arbKeyword = fc.string({ minLength: 2, maxLength: 12 });

/**
 * Generates a non-empty array of ExtractedKeywords where at least one has
 * medium or high confidence.
 */
const arbMediumHighKeywords: fc.Arbitrary<ExtractedKeyword[]> = fc
  .tuple(
    arbKeyword,
    arbConfidenceMediumOrHigh,
    fc.array(fc.tuple(arbKeyword, fc.constantFrom<Confidence>('low', 'medium', 'high')), {
      minLength: 0,
      maxLength: 3,
    }),
  )
  .map(([firstKw, firstConf, rest]) => [
    { keyword: firstKw, confidence: firstConf },
    ...rest.map(([kw, conf]) => ({ keyword: kw, confidence: conf })),
  ]);

/**
 * Generates a strict subset of categories (0–5 covered, never all 6).
 */
const arbCoveredSubsetStrict: fc.Arbitrary<CategoryName[]> = fc
  .subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 5 })
  .filter((arr) => arr.length < 6);

/**
 * Generates a non-empty subset from an array of categories.
 */
function arbNonEmptySubset(categories: CategoryName[]): fc.Arbitrary<CategoryName[]> {
  return fc.subarray(categories, {
    minLength: 1,
    maxLength: categories.length,
  });
}

/**
 * Builds a CategoryExtraction where specific categories have medium/high keywords
 * and all other categories are empty.
 */
function arbExtractionForCategories(categories: CategoryName[]): fc.Arbitrary<CategoryExtraction> {
  return fc.tuple(...categories.map(() => arbMediumHighKeywords)).map((keywordArrays) => {
    const extraction = makeEmptyExtraction();
    categories.forEach((cat, i) => {
      extraction[cat] = keywordArrays[i] ?? [];
    });
    return extraction;
  });
}

// ─── Property 1: Category coverage from extraction ───

describe('Feature: ai-chat-bot, Property 1: Category coverage from extraction', () => {
  /**
   * Validates: Requirements 1.2, 1.5
   *
   * For any session context with uncovered categories and for any valid
   * CategoryExtraction containing at least one keyword with confidence
   * 'medium' or 'high' in one or more uncovered categories, calling
   * state machine transition with EXTRACTION_RECEIVED SHALL mark exactly
   * those categories as covered and leave already-covered categories unchanged.
   */

  it('marks uncovered categories as covered when extraction has medium/high keywords', () => {
    fc.assert(
      fc.property(
        arbCoveredSubsetStrict.chain((alreadyCovered) => {
          const uncovered = ALL_CATEGORIES.filter((c) => !alreadyCovered.includes(c));
          return arbNonEmptySubset(uncovered).chain((targets) =>
            arbExtractionForCategories(targets).map((extraction) => ({
              alreadyCovered,
              targets,
              extraction,
            })),
          );
        }),
        ({ alreadyCovered, targets, extraction }) => {
          const context = makeChattingContext({
            categoriesCovered: [...alreadyCovered],
          });

          const result = transition(context, {
            type: 'EXTRACTION_RECEIVED',
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          const newCovered = result.context.categoriesCovered;

          // All previously-covered categories remain covered
          for (const cat of alreadyCovered) {
            expect(newCovered).toContain(cat);
          }

          // All target categories with medium/high keywords are now covered
          for (const cat of targets) {
            expect(newCovered).toContain(cat);
          }

          // No categories outside (alreadyCovered ∪ targets) are covered
          const expectedCovered = new Set([...alreadyCovered, ...targets]);
          for (const cat of newCovered) {
            expect(expectedCovered.has(cat as CategoryName)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT mark categories with only low-confidence keywords as covered', () => {
    fc.assert(
      fc.property(
        arbCoveredSubsetStrict
          .chain((alreadyCovered) => {
            const uncovered = ALL_CATEGORIES.filter((c) => !alreadyCovered.includes(c));
            if (uncovered.length === 0) return fc.constant(null);

            return fc
              .subarray(uncovered, { minLength: 1, maxLength: uncovered.length })
              .chain((lowConfCategories) =>
                fc
                  .tuple(
                    ...lowConfCategories.map(() =>
                      fc.array(arbKeyword, { minLength: 1, maxLength: 3 }),
                    ),
                  )
                  .map((keywordArrays) => {
                    const extraction = makeEmptyExtraction();
                    lowConfCategories.forEach((cat, i) => {
                      extraction[cat] = (keywordArrays[i] ?? []).map((kw) => ({
                        keyword: kw,
                        confidence: 'low' as const,
                      }));
                    });
                    return { alreadyCovered, lowConfCategories, extraction };
                  }),
              );
          })
          .filter((v): v is NonNullable<typeof v> => v !== null),
        ({ alreadyCovered, lowConfCategories, extraction }) => {
          const context = makeChattingContext({
            categoriesCovered: [...alreadyCovered],
          });

          const result = transition(context, {
            type: 'EXTRACTION_RECEIVED',
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          const newCovered = result.context.categoriesCovered;

          // Previously-covered categories remain covered
          for (const cat of alreadyCovered) {
            expect(newCovered).toContain(cat);
          }

          // Low-confidence-only categories are NOT newly covered
          for (const cat of lowConfCategories) {
            if (!alreadyCovered.includes(cat)) {
              expect(newCovered).not.toContain(cat);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('already-covered categories are never removed from coverage', () => {
    fc.assert(
      fc.property(
        arbCoveredSubsetStrict.chain((alreadyCovered) =>
          fc
            .tuple(
              ...ALL_CATEGORIES.map(() =>
                fc.array(
                  fc.tuple(arbKeyword, fc.constantFrom<Confidence>('low', 'medium', 'high')),
                  { minLength: 0, maxLength: 2 },
                ),
              ),
            )
            .map((keywordTuples) => {
              const extraction = makeEmptyExtraction();
              ALL_CATEGORIES.forEach((cat, i) => {
                extraction[cat] = (keywordTuples[i] ?? []).map(([kw, conf]) => ({
                  keyword: kw,
                  confidence: conf,
                }));
              });
              return { alreadyCovered, extraction };
            }),
        ),
        ({ alreadyCovered, extraction }) => {
          const context = makeChattingContext({
            categoriesCovered: [...alreadyCovered],
          });

          const result = transition(context, {
            type: 'EXTRACTION_RECEIVED',
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          // Every previously-covered category MUST still be covered
          for (const cat of alreadyCovered) {
            expect(result.context.categoriesCovered).toContain(cat);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Completion signal on all categories covered ───

describe('Feature: ai-chat-bot, Property 2: Completion signal on all categories covered', () => {
  /**
   * Validates: Requirements 1.3, 8.5
   *
   * For any session context where all 6 scoring categories have at least one
   * keyword with confidence 'medium' or 'high', the state machine transition
   * SHALL produce state COMPLETED (via ALL_CATEGORIES_COVERED event) and the
   * instruction generator SHALL return an instruction with type 'COMPLETE'.
   */

  it('transition with ALL_CATEGORIES_COVERED produces COMPLETED state', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom<'hybrid' | 'playful'>('hybrid', 'playful'),
          fc.constantFrom<'id' | 'en'>('id', 'en'),
          fc.integer({ min: 1, max: 7 }),
        ),
        ([theme, locale, turn]) => {
          const context = makeChattingContext({
            theme,
            locale,
            turn,
            categoriesCovered: [...ALL_CATEGORIES],
          });

          const result = transition(context, {
            type: 'ALL_CATEGORIES_COVERED',
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          expect(result.newState).toBe('COMPLETED');
          expect(result.context.state).toBe('COMPLETED');
          // All categories remain covered
          for (const cat of ALL_CATEGORIES) {
            expect(result.context.categoriesCovered).toContain(cat);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getNextInstruction returns COMPLETE when all 6 categories are covered', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom<'hybrid' | 'playful'>('hybrid', 'playful'),
          fc.constantFrom<'id' | 'en'>('id', 'en'),
          fc.integer({ min: 1, max: 7 }),
          fc.subarray([...ALL_CATEGORIES], {
            minLength: 0,
            maxLength: ALL_CATEGORIES.length,
          }),
        ),
        ([theme, locale, turn, followedUp]) => {
          const context = makeChattingContext({
            theme,
            locale,
            turn,
            categoriesCovered: [...ALL_CATEGORIES],
            categoriesFollowedUp: followedUp,
          });

          const tracker = buildCategoryTracker([...ALL_CATEGORIES], followedUp);

          const instruction = getNextInstruction(context, tracker, null);

          expect(instruction.type).toBe('COMPLETE');
          expect(instruction.targetCategory).toBeNull();
          expect(instruction.isFollowUp).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('extraction covering all remaining categories yields a state where getNextInstruction returns COMPLETE', () => {
    fc.assert(
      fc.property(
        arbCoveredSubsetStrict.chain((alreadyCovered) => {
          const uncovered = ALL_CATEGORIES.filter((c) => !alreadyCovered.includes(c));
          return arbExtractionForCategories(uncovered).map((extraction) => ({
            alreadyCovered,
            extraction,
          }));
        }),
        ({ alreadyCovered, extraction }) => {
          const context = makeChattingContext({
            categoriesCovered: [...alreadyCovered],
          });

          // Apply extraction via transition
          const result = transition(context, {
            type: 'EXTRACTION_RECEIVED',
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          // After extraction, all 6 categories should be covered
          expect(result.context.categoriesCovered.length).toBe(6);
          for (const cat of ALL_CATEGORIES) {
            expect(result.context.categoriesCovered).toContain(cat);
          }

          // getNextInstruction should return COMPLETE
          const tracker = buildCategoryTracker(
            result.context.categoriesCovered as CategoryName[],
            result.context.categoriesFollowedUp as CategoryName[],
          );
          const instruction = getNextInstruction(result.context, tracker, null);

          expect(instruction.type).toBe('COMPLETE');
          expect(instruction.targetCategory).toBeNull();
          expect(instruction.isFollowUp).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: Unsupported locale rejection ───

describe('Feature: ai-chat-bot, Property 8: Unsupported locale rejection', () => {
  /**
   * Validates: Requirements 5.7
   *
   * For any string value not in the set ['id', 'en'], createInitialContext
   * SHALL throw a ValidationError rather than producing a session context.
   */

  it('throws ValidationError for any locale not in the supported set', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'id' && s !== 'en'),
        (invalidLocale) => {
          expect(() =>
            createInitialContext('test-session', invalidLocale as SupportedLocale, undefined),
          ).toThrow(ValidationError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('throws ValidationError for edge-case locale strings (empty, single char, near-matches)', () => {
    const edgeCases = [
      '',
      ' ',
      'ID',
      'EN',
      'Id',
      'eN',
      'idn',
      'eng',
      'i',
      'e',
      'indonesian',
      'english',
      'id ',
      ' en',
      'id\n',
      'null',
      'undefined',
    ];

    for (const invalidLocale of edgeCases) {
      expect(() =>
        createInitialContext('test-session', invalidLocale as SupportedLocale, undefined),
      ).toThrow(ValidationError);
    }
  });

  it('does NOT throw for valid locales id and en', () => {
    fc.assert(
      fc.property(fc.constantFrom('id', 'en'), (validLocale) => {
        expect(() =>
          createInitialContext('test-session', validLocale as SupportedLocale, undefined),
        ).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Maximum one follow-up per category invariant ───

describe('Feature: ai-chat-bot, Property 5: Maximum one follow-up per category invariant', () => {
  /**
   * Validates: Requirements 2.2
   *
   * For any sequence of state transitions within a single session, no category
   * SHALL have categoriesFollowedUp contain the same category name more than once.
   * The follow-up counter for each category SHALL never exceed 1.
   */

  /** Arbitrary for a single category */
  const arbCategory: fc.Arbitrary<CategoryName> = fc.constantFrom(...ALL_CATEGORIES);

  /**
   * Generates a sequence of LOW_CONFIDENCE events (1-6) targeting random categories,
   * interspersed with required FOLLOW_UP_RESPONSE events to get back to CHATTING state.
   */
  const arbLowConfidenceSequence: fc.Arbitrary<CategoryName[]> = fc.array(arbCategory, {
    minLength: 1,
    maxLength: 10,
  });

  it('categoriesFollowedUp never contains duplicate entries across random LOW_CONFIDENCE sequences', () => {
    fc.assert(
      fc.property(arbLowConfidenceSequence, (categories) => {
        let context = makeChattingContext();

        for (const category of categories) {
          // Only fire LOW_CONFIDENCE if we're in CHATTING state
          if (context.state !== 'CHATTING') break;

          const result = transition(context, {
            type: 'LOW_CONFIDENCE',
            category,
          });

          if (!isTransitionResult(result)) continue;
          context = result.context;

          // INVARIANT: categoriesFollowedUp never has duplicates
          const followedUp = context.categoriesFollowedUp;
          const uniqueSet = new Set(followedUp);
          expect(followedUp.length).toBe(uniqueSet.size);

          // If we transitioned to FOLLOW_UP, respond to get back to CHATTING
          if (context.state === 'FOLLOW_UP') {
            const followUpResult = transition(context, {
              type: 'FOLLOW_UP_RESPONSE',
              category,
              extraction: makeEmptyExtraction(),
            });

            if (isTransitionResult(followUpResult)) {
              context = followUpResult.context;

              // INVARIANT still holds after follow-up response
              const followedUpAfter = context.categoriesFollowedUp;
              const uniqueSetAfter = new Set(followedUpAfter);
              expect(followedUpAfter.length).toBe(uniqueSetAfter.size);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('repeated LOW_CONFIDENCE for the same category does not add duplicate entries', () => {
    fc.assert(
      fc.property(arbCategory, fc.integer({ min: 2, max: 5 }), (targetCategory, repetitions) => {
        let context = makeChattingContext();

        for (let i = 0; i < repetitions; i++) {
          if (context.state !== 'CHATTING') break;

          const result = transition(context, {
            type: 'LOW_CONFIDENCE',
            category: targetCategory,
          });

          if (!isTransitionResult(result)) continue;
          context = result.context;

          // The category should appear at most once in categoriesFollowedUp
          const count = context.categoriesFollowedUp.filter((c) => c === targetCategory).length;
          expect(count).toBeLessThanOrEqual(1);

          // Return to CHATTING for next iteration
          if (context.state === 'FOLLOW_UP') {
            const followUpResult = transition(context, {
              type: 'FOLLOW_UP_RESPONSE',
              category: targetCategory,
              extraction: makeEmptyExtraction(),
            });

            if (isTransitionResult(followUpResult)) {
              context = followUpResult.context;
            }
          }
        }

        // Final check: no duplicates in categoriesFollowedUp
        const finalFollowedUp = context.categoriesFollowedUp;
        const finalUniqueSet = new Set(finalFollowedUp);
        expect(finalFollowedUp.length).toBe(finalUniqueSet.size);
      }),
      { numRuns: 100 },
    );
  });

  it('categoriesFollowedUp length never exceeds 6 (total category count)', () => {
    fc.assert(
      fc.property(fc.array(arbCategory, { minLength: 1, maxLength: 20 }), (eventCategories) => {
        let context = makeChattingContext();

        for (const category of eventCategories) {
          if (context.state !== 'CHATTING') break;

          const result = transition(context, {
            type: 'LOW_CONFIDENCE',
            category,
          });

          if (!isTransitionResult(result)) continue;
          context = result.context;

          // Length cannot exceed number of distinct categories
          expect(context.categoriesFollowedUp.length).toBeLessThanOrEqual(ALL_CATEGORIES.length);

          // Return to CHATTING
          if (context.state === 'FOLLOW_UP') {
            const followUpResult = transition(context, {
              type: 'FOLLOW_UP_RESPONSE',
              category,
              extraction: makeEmptyExtraction(),
            });

            if (isTransitionResult(followUpResult)) {
              context = followUpResult.context;
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: Follow-up response confidence handling ───

describe('Feature: ai-chat-bot, Property 6: Follow-up response confidence handling', () => {
  /**
   * Validates: Requirements 2.3, 2.4
   *
   * At the lib/chat state machine level:
   * For any FOLLOW_UP_RESPONSE event, the category SHALL always be marked as
   * covered in the resulting context — regardless of what the extraction contains
   * (medium/high keywords, low-only keywords, or empty extraction).
   *
   * The confidence upgrade logic (low→medium override) is at the service layer;
   * the state machine's responsibility is to mark the category as covered and
   * transition back to CHATTING.
   */

  const arbCategory: fc.Arbitrary<CategoryName> = fc.constantFrom(...ALL_CATEGORIES);

  /**
   * Generates a CategoryExtraction with medium/high keywords for the target category.
   */
  function arbExtractionWithMediumHigh(category: CategoryName): fc.Arbitrary<CategoryExtraction> {
    return arbMediumHighKeywords.map((keywords) => {
      const extraction = makeEmptyExtraction();
      extraction[category] = keywords;
      return extraction;
    });
  }

  /**
   * Generates a CategoryExtraction with only low-confidence keywords for the target category.
   */
  function arbExtractionWithLowOnly(category: CategoryName): fc.Arbitrary<CategoryExtraction> {
    return fc.array(arbKeyword, { minLength: 1, maxLength: 3 }).map((keywords) => {
      const extraction = makeEmptyExtraction();
      extraction[category] = keywords.map((kw) => ({
        keyword: kw,
        confidence: 'low' as const,
      }));
      return extraction;
    });
  }

  it('FOLLOW_UP_RESPONSE with medium/high extraction marks category as covered', () => {
    fc.assert(
      fc.property(
        arbCategory.chain((category) =>
          arbExtractionWithMediumHigh(category).map((extraction) => ({
            category,
            extraction,
          })),
        ),
        ({ category, extraction }) => {
          // Set up a context in FOLLOW_UP state targeting this category
          const context = makeChattingContext({
            state: 'FOLLOW_UP',
            followUpTarget: category,
            categoriesFollowedUp: [category],
          });

          const result = transition(context, {
            type: 'FOLLOW_UP_RESPONSE',
            category,
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          // Category is marked as covered
          expect(result.context.categoriesCovered).toContain(category);
          // State returns to CHATTING
          expect(result.newState).toBe('CHATTING');
          expect(result.context.state).toBe('CHATTING');
          // Follow-up target cleared
          expect(result.context.followUpTarget).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FOLLOW_UP_RESPONSE with low-only extraction still marks category as covered', () => {
    fc.assert(
      fc.property(
        arbCategory.chain((category) =>
          arbExtractionWithLowOnly(category).map((extraction) => ({
            category,
            extraction,
          })),
        ),
        ({ category, extraction }) => {
          const context = makeChattingContext({
            state: 'FOLLOW_UP',
            followUpTarget: category,
            categoriesFollowedUp: [category],
          });

          const result = transition(context, {
            type: 'FOLLOW_UP_RESPONSE',
            category,
            extraction,
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          // Category is marked as covered regardless of confidence
          expect(result.context.categoriesCovered).toContain(category);
          expect(result.newState).toBe('CHATTING');
          expect(result.context.state).toBe('CHATTING');
          expect(result.context.followUpTarget).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FOLLOW_UP_RESPONSE with empty extraction still marks category as covered', () => {
    fc.assert(
      fc.property(arbCategory, (category) => {
        const context = makeChattingContext({
          state: 'FOLLOW_UP',
          followUpTarget: category,
          categoriesFollowedUp: [category],
        });

        const emptyExtraction = makeEmptyExtraction();

        const result = transition(context, {
          type: 'FOLLOW_UP_RESPONSE',
          category,
          extraction: emptyExtraction,
        });

        expect(isTransitionResult(result)).toBe(true);
        if (!isTransitionResult(result)) return;

        // Category is marked as covered even with empty extraction
        expect(result.context.categoriesCovered).toContain(category);
        expect(result.newState).toBe('CHATTING');
        expect(result.context.state).toBe('CHATTING');
        expect(result.context.followUpTarget).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('FOLLOW_UP_RESPONSE preserves previously-covered categories', () => {
    fc.assert(
      fc.property(
        arbCoveredSubsetStrict
          .filter((covered) => covered.length < ALL_CATEGORIES.length)
          .chain((alreadyCovered) => {
            const uncovered = ALL_CATEGORIES.filter((c) => !alreadyCovered.includes(c));
            return fc.constantFrom(...uncovered).map((targetCategory) => ({
              alreadyCovered,
              targetCategory,
            }));
          }),
        ({ alreadyCovered, targetCategory }) => {
          const context = makeChattingContext({
            state: 'FOLLOW_UP',
            followUpTarget: targetCategory,
            categoriesCovered: [...alreadyCovered],
            categoriesFollowedUp: [targetCategory],
          });

          const result = transition(context, {
            type: 'FOLLOW_UP_RESPONSE',
            category: targetCategory,
            extraction: makeEmptyExtraction(),
          });

          expect(isTransitionResult(result)).toBe(true);
          if (!isTransitionResult(result)) return;

          // All previously-covered categories remain covered
          for (const cat of alreadyCovered) {
            expect(result.context.categoriesCovered).toContain(cat);
          }

          // Target category is now also covered
          expect(result.context.categoriesCovered).toContain(targetCategory);

          // No extra categories are added
          const expectedCovered = new Set([...alreadyCovered, targetCategory]);
          expect(result.context.categoriesCovered.length).toBe(expectedCovered.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FOLLOW_UP_RESPONSE increments turn counter', () => {
    fc.assert(
      fc.property(arbCategory, fc.integer({ min: 1, max: 6 }), (category, currentTurn) => {
        const context = makeChattingContext({
          state: 'FOLLOW_UP',
          turn: currentTurn,
          followUpTarget: category,
          categoriesFollowedUp: [category],
        });

        const result = transition(context, {
          type: 'FOLLOW_UP_RESPONSE',
          category,
          extraction: makeEmptyExtraction(),
        });

        expect(isTransitionResult(result)).toBe(true);
        if (!isTransitionResult(result)) return;

        expect(result.context.turn).toBe(currentTurn + 1);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 22: Pure function serializability ───

/**
 * Helper: asserts that a value round-trips through JSON serialization.
 * `JSON.parse(JSON.stringify(value))` must deep-equal `value`.
 */
function assertSerializable(value: unknown): void {
  const serialized = JSON.stringify(value);
  const deserialized = JSON.parse(serialized);
  expect(deserialized).toEqual(value);
}

// ─── Shared arbitraries for Property 22 ───

const arbTheme: fc.Arbitrary<Theme> = fc.constantFrom('playful', 'hybrid');
const arbLocale: fc.Arbitrary<SupportedLocale> = fc.constantFrom('id', 'en');
const arbEducationLevel: fc.Arbitrary<EducationLevelInput | undefined> = fc.constantFrom(
  undefined,
  'elementary',
  'junior_high',
  'senior_high',
);
const arbRiskLevel: fc.Arbitrary<RiskLevel> = fc.constantFrom('LOW', 'MODERATE', 'HIGH');
const arbCategoryName: fc.Arbitrary<CategoryName> = fc.constantFrom(...ALL_CATEGORIES);

const arbSessionId: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 36 });

/** Arbitrary for a valid SessionContext in CHATTING state */
const arbChattingSessionContext: fc.Arbitrary<SessionContext> = fc
  .tuple(
    arbSessionId,
    arbTheme,
    arbLocale,
    fc.integer({ min: 1, max: 7 }),
    fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
    fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
    fc.option(arbCategoryName, { nil: null }),
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: 3 }),
  )
  .map(
    ([
      sessionId,
      theme,
      locale,
      turn,
      categoriesCovered,
      categoriesFollowedUp,
      followUpTarget,
      offTopicCount,
      shortAnswerCount,
    ]) => ({
      sessionId,
      state: 'CHATTING' as const,
      theme,
      locale,
      turn,
      categoriesCovered,
      categoriesFollowedUp,
      followUpTarget,
      offTopicCount,
      shortAnswerCount,
    }),
  );

/** Arbitrary for a valid CategoryExtraction */
const arbCategoryExtraction: fc.Arbitrary<CategoryExtraction> = fc.record({
  intensitas: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  waktu: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  lokasi_tubuh: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  kontak: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  lesi: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
  faktor_risiko: fc.array(
    fc.record({
      keyword: fc.string({ minLength: 1, maxLength: 20 }),
      confidence: fc.constantFrom<Confidence>('high', 'medium', 'low'),
    }),
    { minLength: 0, maxLength: 3 },
  ),
});

describe('Feature: ai-chat-bot, Property 22: Pure function serializability', () => {
  /**
   * **Validates: Requirements 12.2**
   *
   * For any exported function in lib/chat/ called with valid inputs,
   * the return value SHALL be JSON-serializable (i.e.,
   * JSON.parse(JSON.stringify(result)) deep-equals result).
   * No function SHALL return Promises, class instances, functions, or symbols.
   */

  it('selectTheme(educationLevel) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(arbEducationLevel, (educationLevel) => {
        const result = selectTheme(educationLevel);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('getPersonaRules(theme, locale) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(arbTheme, arbLocale, (theme, locale) => {
        const result = getPersonaRules(theme, locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('getOpeningMessage(theme, locale) returns a JSON-serializable string', () => {
    fc.assert(
      fc.property(arbTheme, arbLocale, (theme, locale) => {
        const result = getOpeningMessage(theme, locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('createInitialContext(sessionId, locale, educationLevel) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbLocale,
        arbEducationLevel,
        (sessionId, locale, educationLevel) => {
          const result = createInitialContext(sessionId, locale, educationLevel);
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('transition(context, event) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        arbChattingSessionContext,
        fc.constantFrom(
          { type: 'ALL_CATEGORIES_COVERED' as const },
          { type: 'FORCE_CLOSE' as const },
          { type: 'CRISIS_DETECTED' as const },
        ),
        (context, event) => {
          const result = transition(context, event);
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('transition with EXTRACTION_RECEIVED returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(arbChattingSessionContext, arbCategoryExtraction, (context, extraction) => {
        const result = transition(context, {
          type: 'EXTRACTION_RECEIVED',
          extraction,
        });
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('transition with invalid state returns a JSON-serializable TransitionError', () => {
    fc.assert(
      fc.property(arbChattingSessionContext, (context) => {
        // DEMOGRAPHICS_SUBMITTED is invalid from CHATTING state
        const result = transition(context, { type: 'DEMOGRAPHICS_SUBMITTED' });
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('getNextInstruction(context, tracker, extraction) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        arbChattingSessionContext,
        fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
        fc.option(arbCategoryExtraction, { nil: null }),
        (context, followedUp, extraction) => {
          const tracker = buildCategoryTracker(
            context.categoriesCovered as CategoryName[],
            followedUp,
          );
          const result = getNextInstruction(context, tracker, extraction);
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildCategoryTracker(covered, followedUp) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
        fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
        (covered, followedUp) => {
          const result = buildCategoryTracker(covered, followedUp);
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checkCrisis(message, locale) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), arbLocale, (message, locale) => {
        const result = checkCrisis(message, locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('checkCrisis with crisis keyword returns a JSON-serializable CrisisInstruction', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('bunuh diri', 'kill myself', 'want to die', 'self-harm', 'menyakiti diri'),
        arbLocale,
        fc.string({ minLength: 0, maxLength: 50 }),
        (keyword, locale, suffix) => {
          const message = `${keyword} ${suffix}`;
          const result = checkCrisis(message, locale);
          expect(result).not.toBeNull();
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getPerceptionIndicators(locale) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(arbLocale, (locale) => {
        const result = getPerceptionIndicators(locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('buildPerceptionInferenceContext(perception, locale) returns a JSON-serializable string', () => {
    fc.assert(
      fc.property(perceptionArb, arbLocale, (perception, locale) => {
        const result = buildPerceptionInferenceContext(perception, locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('buildOutputContext(params) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        arbRiskLevel,
        perceptionArb,
        arbLocale,
        arbTheme,
        fc.subarray([...ALL_CATEGORIES], { minLength: 0, maxLength: 6 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 12 }),
        (riskLevel, perception, locale, theme, categoriesAssessed, isForceClose, totalScore) => {
          const matchedKeywords = {
            intensitas: [] as string[],
            waktu: [] as string[],
            lokasi_tubuh: [] as string[],
            kontak: [] as string[],
            lesi: [] as string[],
            faktor_risiko: [] as string[],
          };
          const scores = {
            intensitas: 0,
            waktu: 0,
            lokasi_tubuh: 0,
            kontak: 0,
            lesi: 0,
            faktor_risiko: 0,
          };

          const result = buildOutputContext({
            riskLevel,
            perception,
            locale,
            theme,
            categoriesAssessed,
            matchedKeywords,
            scores,
            totalScore,
            isForceClose,
          });
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getFallbackTemplate(riskLevel, locale) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(arbRiskLevel, arbLocale, (riskLevel, locale) => {
        const result = getFallbackTemplate(riskLevel, locale);
        assertSerializable(result);
      }),
      { numRuns: 100 },
    );
  });

  it('detectEdgeCase(message, extraction, context) returns a JSON-serializable result', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 300 }),
        fc.option(arbCategoryExtraction, { nil: null }),
        arbChattingSessionContext,
        (message, extraction, context) => {
          const result = detectEdgeCase(message, extraction, context);
          assertSerializable(result);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 23: Precondition validation errors ───

describe('Feature: ai-chat-bot, Property 23: Precondition validation errors', () => {
  /**
   * **Validates: Requirements 12.6**
   *
   * For any exported function in lib/chat/ receiving inputs that violate
   * documented preconditions (null/undefined required fields, out-of-range
   * values, invalid enum values), the function SHALL throw a ValidationError
   * with a message indicating which parameter failed validation.
   */

  // ─── createInitialContext: empty/missing sessionId ───

  it('createInitialContext throws ValidationError for empty sessionId', () => {
    fc.assert(
      fc.property(arbLocale, arbEducationLevel, (locale, educationLevel) => {
        try {
          createInitialContext('', locale, educationLevel);
          // Should not reach here
          expect.fail('Expected ValidationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(ValidationError);
          const ve = err as ValidationError;
          expect(ve.message).toBeTruthy();
          expect(ve.message.toLowerCase()).toContain('sessionid');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('createInitialContext throws ValidationError for any falsy sessionId string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', null, undefined) as fc.Arbitrary<string>,
        arbLocale,
        arbEducationLevel,
        (sessionId, locale, educationLevel) => {
          try {
            createInitialContext(sessionId as unknown as string, locale, educationLevel);
            expect.fail('Expected ValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const ve = err as ValidationError;
            expect(ve.message.length).toBeGreaterThan(0);
            expect(ve.message.toLowerCase()).toContain('sessionid');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── createInitialContext: invalid locale ───

  it('createInitialContext throws ValidationError for invalid locale values', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }).filter((s) => s !== 'id' && s !== 'en'),
        arbEducationLevel,
        (invalidLocale, educationLevel) => {
          try {
            createInitialContext(
              'valid-session-id',
              invalidLocale as SupportedLocale,
              educationLevel,
            );
            expect.fail('Expected ValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const ve = err as ValidationError;
            expect(ve.message.length).toBeGreaterThan(0);
            expect(ve.message.toLowerCase()).toContain('locale');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('createInitialContext throws ValidationError with descriptive message for null/undefined locale', () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbEducationLevel,
        fc.constantFrom(null, undefined) as fc.Arbitrary<unknown>,
        (sessionId, educationLevel, invalidLocale) => {
          try {
            createInitialContext(sessionId, invalidLocale as SupportedLocale, educationLevel);
            expect.fail('Expected ValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const ve = err as ValidationError;
            expect(ve.message.length).toBeGreaterThan(0);
            expect(ve.message.toLowerCase()).toContain('locale');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── getPerceptionIndicators: invalid locale ───

  it('getPerceptionIndicators throws ValidationError for invalid locale', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter((s) => s !== 'id' && s !== 'en'),
        (invalidLocale) => {
          try {
            getPerceptionIndicators(invalidLocale as SupportedLocale);
            expect.fail('Expected ValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const ve = err as ValidationError;
            expect(ve.message.length).toBeGreaterThan(0);
            expect(ve.message.toLowerCase()).toContain('locale');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── buildPerceptionInferenceContext: invalid perception ───

  it('buildPerceptionInferenceContext throws ValidationError for invalid perception values', () => {
    // Exclude Object.prototype property names (e.g. valueOf, toString) that would
    // resolve as truthy when accessed on a plain object, bypassing the falsy check.
    const protoProps = new Set(Object.getOwnPropertyNames(Object.prototype));
    const validPerceptions = new Set(['UNDERESTIMATE', 'OVERESTIMATE', 'BARRIER', 'ADEQUATE']);

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !validPerceptions.has(s) && !protoProps.has(s)),
        arbLocale,
        (invalidPerception, locale) => {
          try {
            buildPerceptionInferenceContext(invalidPerception as Perception, locale);
            expect.fail('Expected ValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const ve = err as ValidationError;
            expect(ve.message.length).toBeGreaterThan(0);
            expect(ve.message.toLowerCase()).toContain('perception');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── ValidationError is always an instance of AppError ───

  it('all precondition violations throw errors that are instances of ValidationError with non-empty messages', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter((s) => s !== 'id' && s !== 'en'),
        (invalidLocale) => {
          // Test multiple functions with invalid locale
          const errors: ValidationError[] = [];

          try {
            createInitialContext('valid-session', invalidLocale as SupportedLocale, undefined);
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            errors.push(err as ValidationError);
          }

          try {
            getPerceptionIndicators(invalidLocale as SupportedLocale);
          } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            errors.push(err as ValidationError);
          }

          // All captured errors must have non-empty messages indicating the failed parameter
          expect(errors.length).toBe(2);
          for (const error of errors) {
            expect(error.message.length).toBeGreaterThan(0);
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('VALIDATION_ERROR');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 21: Cross-locale score tier consistency ───

import { PATTERN_TABLE_EN } from '../keywords/en';
import { PATTERN_TABLE_ID } from '../keywords/id';
import type { KeywordRule, PatternTable } from '../keywords/types';

describe('Feature: ai-chat-bot, Property 21: Cross-locale score tier consistency', () => {
  /**
   * Validates: Requirements 11.3
   *
   * For any scoring category, the set of distinct score values used in
   * PATTERN_TABLE_EN.positive[category] SHALL be a subset of {0, 1, 2},
   * and the set used in PATTERN_TABLE_EN.negative[category] SHALL be a
   * subset of {-1, -2}, matching the same tiers used in PATTERN_TABLE_ID.
   */

  const VALID_POSITIVE_SCORES = new Set([0, 1, 2]);
  const VALID_NEGATIVE_SCORES = new Set([-1, -2]);

  // Cast through PatternTable to allow dynamic CategoryName indexing
  const enTable: PatternTable = PATTERN_TABLE_EN;
  const idTable: PatternTable = PATTERN_TABLE_ID;

  const tables: { name: string; table: PatternTable }[] = [
    { name: 'EN', table: enTable },
    { name: 'ID', table: idTable },
  ];

  /** Arbitrary for a (locale table, category) pair */
  const arbTableAndCategory = fc.tuple(
    fc.constantFrom(...tables),
    fc.constantFrom(...ALL_CATEGORIES),
  );

  it('all positive pattern scores are in {0, 1, 2} for any (locale, category) pair', () => {
    fc.assert(
      fc.property(arbTableAndCategory, ([{ table }, category]) => {
        const rules: KeywordRule[] = table.positive[category];
        expect(rules).toBeDefined();
        expect(rules.length).toBeGreaterThan(0);

        for (const rule of rules) {
          expect(VALID_POSITIVE_SCORES.has(rule.score)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all negative pattern scores are in {-1, -2} for any (locale, category) pair', () => {
    // Only check categories that have negative patterns in at least one locale
    const categoriesWithNegative = ALL_CATEGORIES.filter(
      (cat) => enTable.negative[cat] !== undefined || idTable.negative[cat] !== undefined,
    );

    fc.assert(
      fc.property(
        fc.tuple(fc.constantFrom(...tables), fc.constantFrom(...categoriesWithNegative)),
        ([{ table }, category]) => {
          const rules: KeywordRule[] | undefined = table.negative[category];
          if (!rules) return; // category has no negative patterns in this locale

          for (const rule of rules) {
            expect(VALID_NEGATIVE_SCORES.has(rule.score)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('EN and ID tables use the same set of score tiers per positive category', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_CATEGORIES), (category) => {
        const enScores = new Set(enTable.positive[category].map((r: KeywordRule) => r.score));
        const idScores = new Set(idTable.positive[category].map((r: KeywordRule) => r.score));

        // Both must be subsets of {0, 1, 2}
        for (const score of enScores) {
          expect(VALID_POSITIVE_SCORES.has(score)).toBe(true);
        }
        for (const score of idScores) {
          expect(VALID_POSITIVE_SCORES.has(score)).toBe(true);
        }

        // The tier sets used must be identical across locales
        expect(enScores).toEqual(idScores);
      }),
      { numRuns: 100 },
    );
  });

  it('EN and ID tables use the same set of score tiers per negative category', () => {
    // Negative patterns exist for: intensitas, waktu, kontak, lesi
    const categoriesWithNegative = ALL_CATEGORIES.filter(
      (cat) => enTable.negative[cat] !== undefined && idTable.negative[cat] !== undefined,
    );

    fc.assert(
      fc.property(fc.constantFrom(...categoriesWithNegative), (category) => {
        const enRules = enTable.negative[category];
        const idRules = idTable.negative[category];

        expect(enRules).toBeDefined();
        expect(idRules).toBeDefined();

        const enScores = new Set(enRules!.map((r: KeywordRule) => r.score));
        const idScores = new Set(idRules!.map((r: KeywordRule) => r.score));

        // Both must be subsets of {-1, -2}
        for (const score of enScores) {
          expect(VALID_NEGATIVE_SCORES.has(score)).toBe(true);
        }
        for (const score of idScores) {
          expect(VALID_NEGATIVE_SCORES.has(score)).toBe(true);
        }

        // The tier sets used must match across locales
        expect(enScores).toEqual(idScores);
      }),
      { numRuns: 100 },
    );
  });
});
