import { SCORING_CONFIG } from '../config';
import type { CategoryExtraction, CategoryName } from '../keywords/types';
import type { EdgeCaseResult, SessionContext } from '../types';

const CATEGORY_ORDER = SCORING_CONFIG.categories;

/**
 * Counts the number of words in a message by splitting on whitespace.
 * Empty or whitespace-only messages return 0.
 */
function countWords(message: string): number {
  const trimmed = message.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Checks whether an extraction contains at least one keyword
 * with medium or high confidence across all categories.
 */
function hasSignificantExtraction(extraction: CategoryExtraction | null): boolean {
  if (!extraction) return false;

  for (const category of CATEGORY_ORDER) {
    const keywords = extraction[category];
    if (keywords.some((kw) => kw.confidence === 'medium' || kw.confidence === 'high')) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an extraction has zero keywords across all categories.
 * Returns true if extraction is null or all category arrays are empty.
 */
function hasZeroKeywords(extraction: CategoryExtraction | null): boolean {
  if (!extraction) return true;

  for (const category of CATEGORY_ORDER) {
    if (extraction[category].length > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the first uncovered category in default ordering.
 * Returns null if all categories are covered.
 */
function getFirstUncoveredCategory(categoriesCovered: CategoryName[]): CategoryName | null {
  for (const category of CATEGORY_ORDER) {
    if (!categoriesCovered.includes(category)) {
      return category;
    }
  }
  return null;
}

/**
 * Detects edge cases in user messages and returns appropriate handling instructions.
 *
 * Priority order: Long message > Short answer > Off-topic > Normal
 *
 * Pure function — no I/O.
 *
 * @param message - Raw user message text
 * @param extraction - LLM extraction result (null if extraction failed or unavailable)
 * @param context - Current session context with counters and state
 * @returns EdgeCaseResult indicating the edge case type and handling instruction
 */
export function detectEdgeCase(
  message: string,
  extraction: CategoryExtraction | null,
  context: SessionContext,
): EdgeCaseResult {
  const wordCount = countWords(message);

  // 1. Long message check (>100 words)
  if (wordCount > 100) {
    return {
      type: 'long_message',
      instruction: {
        type: 'LONG_MESSAGE_CONFIRM',
        targetCategory: null,
        isFollowUp: false,
      },
    };
  }

  // 2. Short answer check (≤2 words AND no medium/high extraction)
  if (wordCount <= 2 && !hasSignificantExtraction(extraction)) {
    if (context.shortAnswerCount >= 1) {
      // Second consecutive short answer → advance
      return {
        type: 'short_answer',
        shouldAdvance: true,
      };
    }

    // First short answer → follow-up question
    const targetCategory =
      context.followUpTarget ?? getFirstUncoveredCategory(context.categoriesCovered);

    return {
      type: 'short_answer',
      instruction: {
        type: 'SHORT_ANSWER_FOLLOW_UP',
        targetCategory: targetCategory,
        isFollowUp: false,
      },
    };
  }

  // 3. Off-topic check (zero keywords across all categories)
  if (hasZeroKeywords(extraction)) {
    if (context.offTopicCount >= 2) {
      // 3rd consecutive off-topic → session close offer
      return {
        type: 'off_topic',
        instruction: {
          type: 'SESSION_CLOSE_OFFER',
          targetCategory: null,
          isFollowUp: false,
        },
      };
    }

    // Redirect on topic
    const targetCategory =
      context.followUpTarget ?? getFirstUncoveredCategory(context.categoriesCovered);

    return {
      type: 'off_topic',
      instruction: {
        type: 'REDIRECT_ON_TOPIC',
        targetCategory: targetCategory,
        isFollowUp: false,
      },
    };
  }

  // 4. Normal — no edge case detected
  return { type: 'normal' };
}
