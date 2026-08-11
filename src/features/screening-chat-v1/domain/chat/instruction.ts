import { SCORING_CONFIG } from '../config';
import type { CategoryName, CategoryExtraction } from '../keywords/types';
import type { CategoryState, CategoryTracker, Instruction, SessionContext } from '../types';

/**
 * Default category exploration order.
 * Used when no follow-up is pending — selects next uncovered category sequentially.
 */
const DEFAULT_CATEGORY_ORDER: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

/**
 * Determines whether a category requires no further action.
 * A category is resolved if it has been covered (medium/high confidence)
 * or if its follow-up opportunity has been exhausted.
 */
function isCategoryResolved(state: CategoryState): boolean {
  return state.covered || state.followUpUsed;
}

/**
 * Checks if a category has pending low-confidence keywords that warrant a follow-up.
 * Returns true when the extraction contains only low-confidence keywords for an
 * uncovered category whose follow-up has not yet been used.
 */
function hasPendingFollowUp(
  category: CategoryName,
  tracker: CategoryTracker,
  extraction: CategoryExtraction | null,
): boolean {
  if (!extraction) return false;

  const state = tracker[category];
  if (state.covered || state.followUpUsed) return false;

  const keywords = extraction[category];
  if (!keywords || keywords.length === 0) return false;

  const hasMediumOrHigh = keywords.some(
    (kw) => kw.confidence === 'medium' || kw.confidence === 'high',
  );

  // Only pending follow-up if ALL keywords are low confidence
  return !hasMediumOrHigh;
}

/**
 * Selects the next instruction for the chat engine to issue.
 *
 * Priority logic:
 * 1. If all 6 categories are resolved (covered or exhausted) → COMPLETE
 * 2. If any uncovered category has pending low-confidence keywords and follow-up not used → FOLLOW_UP
 * 3. Otherwise, select next unresolved category in default order → EXPLORE_CATEGORY
 */
export function getNextInstruction(
  context: SessionContext,
  categoryTracker: CategoryTracker,
  extraction: CategoryExtraction | null,
): Instruction {
  // 1. Check if all categories are resolved
  const allResolved = DEFAULT_CATEGORY_ORDER.every((cat) =>
    isCategoryResolved(categoryTracker[cat]),
  );

  if (allResolved) {
    return { type: 'COMPLETE', targetCategory: null, isFollowUp: false };
  }

  // 2. Check for pending follow-up categories (in default order for determinism)
  for (const category of DEFAULT_CATEGORY_ORDER) {
    if (hasPendingFollowUp(category, categoryTracker, extraction)) {
      return { type: 'FOLLOW_UP', targetCategory: category, isFollowUp: true };
    }
  }

  // 3. Select next unresolved category in default order
  for (const category of DEFAULT_CATEGORY_ORDER) {
    if (!isCategoryResolved(categoryTracker[category])) {
      return {
        type: 'EXPLORE_CATEGORY',
        targetCategory: category,
        isFollowUp: false,
      };
    }
  }

  // Fallback — should not be reachable given step 1 guard, but type-safe
  return { type: 'COMPLETE', targetCategory: null, isFollowUp: false };
}

/**
 * Constructs a CategoryTracker from persisted session state.
 * Used by the service layer to reconstruct tracking state on each turn.
 *
 * @param categoriesCovered - Categories that have been assessed with medium/high confidence
 * @param categoriesFollowedUp - Categories that have already had their follow-up attempt used
 */
export function buildCategoryTracker(
  categoriesCovered: CategoryName[],
  categoriesFollowedUp: CategoryName[],
): CategoryTracker {
  const tracker = {} as CategoryTracker;

  for (const category of SCORING_CONFIG.categories) {
    const covered = categoriesCovered.includes(category);
    const followUpUsed = categoriesFollowedUp.includes(category);

    tracker[category] = {
      covered,
      confidence: null,
      followUpUsed,
      exhausted: covered && followUpUsed,
    };
  }

  return tracker;
}
