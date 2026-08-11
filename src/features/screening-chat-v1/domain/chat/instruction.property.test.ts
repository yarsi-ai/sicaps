import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getNextInstruction, buildCategoryTracker } from './instruction';
import type { SessionContext } from '../types';
import type { CategoryExtraction, CategoryName } from '../keywords/types';

// ─── Constants ───

const DEFAULT_CATEGORY_ORDER: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

// ─── Helpers ───

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

function makeBaseContext(overrides?: Partial<SessionContext>): SessionContext {
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

// ─── Arbitraries ───

const arbCategory = fc.constantFrom<CategoryName>(...DEFAULT_CATEGORY_ORDER);

/**
 * Generates a subset of categories to mark as "covered".
 * Uses a boolean per category for uniform distribution.
 */
const arbCoveredSubset = fc
  .tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean())
  .map((flags) => DEFAULT_CATEGORY_ORDER.filter((_, i) => flags[i]));

/**
 * Generates a subset of categories to mark as "followed up".
 * Must be a subset of categories NOT covered (follow-up only applies to uncovered).
 */
function arbFollowedUpSubset(covered: CategoryName[]): fc.Arbitrary<CategoryName[]> {
  const uncovered = DEFAULT_CATEGORY_ORDER.filter((c) => !covered.includes(c));
  if (uncovered.length === 0) return fc.constant([]);
  return fc
    .tuple(...uncovered.map(() => fc.boolean()))
    .map((flags) => uncovered.filter((_, i) => flags[i]));
}

/**
 * Generates a CategoryExtraction with only low-confidence keywords for
 * specific categories (creating follow-up candidates).
 */
function arbLowConfidenceExtraction(
  followUpCandidates: CategoryName[],
): fc.Arbitrary<CategoryExtraction> {
  return fc
    .tuple(
      ...followUpCandidates.map(() =>
        fc.array(fc.string({ minLength: 2, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
      ),
    )
    .map((keywordArrays) => {
      const extraction = makeEmptyExtraction();
      followUpCandidates.forEach((cat, i) => {
        extraction[cat] = (keywordArrays[i] ?? []).map((kw) => ({
          keyword: kw,
          confidence: 'low' as const,
        }));
      });
      return extraction;
    });
}

// ─── Property 3: Next category priority selection ───

describe('Feature: ai-chat-bot, Property 3: Next category priority selection', () => {
  /**
   * Validates: Requirements 1.4
   *
   * For any set of uncovered categories and for any set of categories with
   * pending low-confidence keywords awaiting follow-up, getNextInstruction
   * SHALL select a pending-follow-up category first; if none exist, it SHALL
   * select the next uncovered category in default ordering.
   */

  it('selects FOLLOW_UP when follow-up candidates exist (low-confidence uncovered categories not yet followed up)', () => {
    fc.assert(
      fc.property(
        arbCoveredSubset
          .filter((covered) => covered.length < 6) // must have uncovered categories
          .chain((covered) =>
            arbFollowedUpSubset(covered).chain((followedUp) => {
              // Determine uncovered categories that have NOT been followed up — these can be follow-up candidates
              const uncoveredNotFollowedUp = DEFAULT_CATEGORY_ORDER.filter(
                (c) => !covered.includes(c) && !followedUp.includes(c),
              );

              if (uncoveredNotFollowedUp.length === 0) {
                // No valid follow-up candidates possible; skip this case
                return fc.constant(null);
              }

              // Pick at least 1 uncovered-not-followed-up category to have low-confidence extraction
              return fc
                .subarray(uncoveredNotFollowedUp, { minLength: 1 })
                .chain((followUpCandidates) =>
                  arbLowConfidenceExtraction(followUpCandidates).map((extraction) => ({
                    covered,
                    followedUp,
                    followUpCandidates,
                    extraction,
                  })),
                );
            }),
          )
          .filter((v): v is NonNullable<typeof v> => v !== null),
        ({ covered, followedUp, followUpCandidates, extraction }) => {
          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          const instruction = getNextInstruction(context, tracker, extraction);

          // Must select FOLLOW_UP
          expect(instruction.type).toBe('FOLLOW_UP');
          expect(instruction.isFollowUp).toBe(true);

          // Target must be one of the follow-up candidates
          expect(instruction.targetCategory).not.toBeNull();
          expect(followUpCandidates).toContain(instruction.targetCategory);

          // Target must be an uncovered category NOT already followed up
          expect(covered).not.toContain(instruction.targetCategory);
          expect(followedUp).not.toContain(instruction.targetCategory);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('selects EXPLORE_CATEGORY with next uncovered in default order when no follow-up candidates exist', () => {
    fc.assert(
      fc.property(
        arbCoveredSubset
          .filter((covered) => covered.length < 6) // must have at least one uncovered
          .chain((covered) =>
            arbFollowedUpSubset(covered).map((followedUp) => ({
              covered,
              followedUp,
            })),
          ),
        ({ covered, followedUp }) => {
          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          // Null extraction = no follow-up candidates possible
          const instruction = getNextInstruction(context, tracker, null);

          // Determine expected target: first unresolved in default order
          const expectedTarget = DEFAULT_CATEGORY_ORDER.find((cat) => {
            const state = tracker[cat];
            return !state.covered && !state.followUpUsed;
          });

          if (expectedTarget) {
            expect(instruction.type).toBe('EXPLORE_CATEGORY');
            expect(instruction.isFollowUp).toBe(false);
            expect(instruction.targetCategory).toBe(expectedTarget);
          } else {
            // All categories are resolved (covered or follow-up exhausted) → COMPLETE
            expect(instruction.type).toBe('COMPLETE');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('follow-up target is always the first eligible in default order among candidates', () => {
    fc.assert(
      fc.property(
        arbCoveredSubset
          .filter((covered) => covered.length < 6)
          .chain((covered) =>
            arbFollowedUpSubset(covered).chain((followedUp) => {
              const uncoveredNotFollowedUp = DEFAULT_CATEGORY_ORDER.filter(
                (c) => !covered.includes(c) && !followedUp.includes(c),
              );

              if (uncoveredNotFollowedUp.length === 0) {
                return fc.constant(null);
              }

              // Create low-confidence extraction for ALL uncovered-not-followed-up categories
              return arbLowConfidenceExtraction(uncoveredNotFollowedUp).map((extraction) => ({
                covered,
                followedUp,
                uncoveredNotFollowedUp,
                extraction,
              }));
            }),
          )
          .filter((v): v is NonNullable<typeof v> => v !== null),
        ({ covered, followedUp, uncoveredNotFollowedUp, extraction }) => {
          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          const instruction = getNextInstruction(context, tracker, extraction);

          // The selected category must be the FIRST in default order among candidates
          const expectedFirst = DEFAULT_CATEGORY_ORDER.find((cat) =>
            uncoveredNotFollowedUp.includes(cat),
          );

          expect(instruction.type).toBe('FOLLOW_UP');
          expect(instruction.targetCategory).toBe(expectedFirst);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Low-confidence triggers follow-up or exhaust ───

describe('Feature: ai-chat-bot, Property 4: Low-confidence triggers follow-up or exhaust', () => {
  /**
   * Validates: Requirements 1.6, 2.1
   *
   * For any uncovered category where the extraction contains only low-confidence
   * keywords, IF the follow-up has not been used for that category THEN the
   * instruction type SHALL be 'FOLLOW_UP'; IF the follow-up has already been used
   * THEN the category SHALL be marked as exhausted and the instruction SHALL
   * target the next uncovered category.
   */

  it('Case A: followUpUsed=false → instruction is FOLLOW_UP targeting that category', () => {
    fc.assert(
      fc.property(
        arbCategory.chain((targetCategory) => {
          // Build a covered set that does NOT include the target category
          const otherCategories = DEFAULT_CATEGORY_ORDER.filter((c) => c !== targetCategory);
          return fc
            .subarray(otherCategories, { minLength: 0, maxLength: otherCategories.length })
            .chain((covered) => {
              // followedUp must NOT include targetCategory (Case A condition)
              // It can include any subset of covered categories or other uncovered ones
              const eligibleForFollowedUp = DEFAULT_CATEGORY_ORDER.filter(
                (c) => c !== targetCategory,
              );
              return fc
                .subarray(eligibleForFollowedUp, {
                  minLength: 0,
                  maxLength: eligibleForFollowedUp.length,
                })
                .chain((followedUp) =>
                  // Generate at least 1 low-confidence keyword for the target category
                  fc
                    .array(fc.string({ minLength: 2, maxLength: 10 }), {
                      minLength: 1,
                      maxLength: 3,
                    })
                    .map((keywords) => ({
                      targetCategory,
                      covered,
                      followedUp,
                      keywords,
                    })),
                );
            });
        }),
        ({ targetCategory, covered, followedUp, keywords }) => {
          const extraction: CategoryExtraction = {
            ...makeEmptyExtraction(),
            [targetCategory]: keywords.map((kw) => ({
              keyword: kw,
              confidence: 'low' as const,
            })),
          };

          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          const instruction = getNextInstruction(context, tracker, extraction);

          // Since targetCategory is uncovered AND not followed up AND has only low-confidence,
          // it should be picked as FOLLOW_UP (assuming it's the first eligible in default order).
          // However, another uncovered+not-followed-up category earlier in default order with
          // NO extraction won't trigger follow-up. So targetCategory is the only follow-up candidate.
          expect(instruction.type).toBe('FOLLOW_UP');
          expect(instruction.targetCategory).toBe(targetCategory);
          expect(instruction.isFollowUp).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Case B: followUpUsed=true → instruction does NOT target that category', () => {
    fc.assert(
      fc.property(
        arbCategory.chain((targetCategory) => {
          // Build a covered set that does NOT include the target category
          const otherCategories = DEFAULT_CATEGORY_ORDER.filter((c) => c !== targetCategory);
          return fc
            .subarray(otherCategories, { minLength: 0, maxLength: otherCategories.length })
            .filter((covered) => {
              // Need at least one category that is NOT covered and NOT the target,
              // OR the target itself (which is uncovered but followed-up — exhausted).
              // We need at least one unresolved category to avoid COMPLETE.
              const allResolved = DEFAULT_CATEGORY_ORDER.every(
                (c) => covered.includes(c) || c === targetCategory, // target will be followed-up (exhausted)
              );
              return !allResolved;
            })
            .chain((covered) => {
              // followedUp MUST include targetCategory (Case B condition)
              // It can also include other categories
              const otherFollowUpCandidates = DEFAULT_CATEGORY_ORDER.filter(
                (c) => c !== targetCategory,
              );
              return fc
                .subarray(otherFollowUpCandidates, {
                  minLength: 0,
                  maxLength: otherFollowUpCandidates.length,
                })
                .map((otherFollowedUp) => ({
                  targetCategory,
                  covered,
                  followedUp: [targetCategory, ...otherFollowedUp],
                }));
            });
        }),
        ({ targetCategory, covered, followedUp }) => {
          // Extraction has only low-confidence keywords for the target category
          const extraction: CategoryExtraction = {
            ...makeEmptyExtraction(),
            [targetCategory]: [{ keyword: 'low-conf-keyword', confidence: 'low' as const }],
          };

          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          const instruction = getNextInstruction(context, tracker, extraction);

          // Since followUpUsed=true for targetCategory, it should NOT be the target.
          // The instruction should either:
          // - EXPLORE_CATEGORY for the next unresolved category, or
          // - FOLLOW_UP for a different eligible category, or
          // - COMPLETE if all are resolved
          expect(instruction.targetCategory).not.toBe(targetCategory);

          // The target category should be treated as exhausted in the tracker
          expect(tracker[targetCategory].followUpUsed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Case B exhaustion: target category is skipped and next uncovered category is selected', () => {
    fc.assert(
      fc.property(
        // Pick a target category that's NOT last in default order, so there's always a "next" one
        fc
          .constantFrom<CategoryName>('intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi')
          .chain((targetCategory) => {
            const targetIndex = DEFAULT_CATEGORY_ORDER.indexOf(targetCategory);
            // Ensure at least one category AFTER target in default order is unresolved
            const categoriesAfterTarget = DEFAULT_CATEGORY_ORDER.slice(targetIndex + 1);

            return fc
              .subarray(categoriesAfterTarget, {
                minLength: 0,
                maxLength: categoriesAfterTarget.length - 1, // leave at least one uncovered after target
              })
              .map((coveredAfterTarget) => {
                // Cover all categories BEFORE target, leave at least one after target uncovered
                const categoriesBeforeTarget = DEFAULT_CATEGORY_ORDER.slice(0, targetIndex);
                const covered = [...categoriesBeforeTarget, ...coveredAfterTarget];
                // followedUp includes target (Case B) plus all categories before target
                const followedUp = [targetCategory, ...categoriesBeforeTarget];

                return { targetCategory, covered, followedUp, categoriesAfterTarget };
              });
          }),
        ({ targetCategory, covered, followedUp }) => {
          const extraction: CategoryExtraction = {
            ...makeEmptyExtraction(),
            [targetCategory]: [{ keyword: 'some-symptom', confidence: 'low' as const }],
          };

          const context = makeBaseContext({
            categoriesCovered: covered,
            categoriesFollowedUp: followedUp,
          });
          const tracker = buildCategoryTracker(covered, followedUp);

          const instruction = getNextInstruction(context, tracker, extraction);

          // Should NOT target the exhausted category
          expect(instruction.targetCategory).not.toBe(targetCategory);

          // Should select the next unresolved category in default order
          const expectedNext = DEFAULT_CATEGORY_ORDER.find((cat) => {
            const state = tracker[cat];
            return !state.covered && !state.followUpUsed;
          });

          if (expectedNext) {
            expect(instruction.targetCategory).toBe(expectedNext);
            // Since there's no low-confidence extraction for the next category, it should be EXPLORE
            expect(instruction.type).toBe('EXPLORE_CATEGORY');
            expect(instruction.isFollowUp).toBe(false);
          } else {
            // All resolved → COMPLETE
            expect(instruction.type).toBe('COMPLETE');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
