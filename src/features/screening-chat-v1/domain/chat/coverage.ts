import { SCORING_CONFIG, coverageSource } from '../config';
import type { CategoryName } from '../keywords/types';

/**
 * Scoring result shape — minimal interface for category coverage determination.
 * Avoids tight coupling to the full ScoringResult type.
 */
interface CategoryScore {
  status: string;
}

interface ScoringResultForCoverage {
  scores: Record<string, CategoryScore>;
}

/**
 * Extraction confidence check — minimal interface.
 */
interface ExtractionKeyword {
  keyword: string;
  confidence: string;
}

type ExtractionForCoverage = Record<string, ExtractionKeyword[]>;

const CATEGORY_ORDER = SCORING_CONFIG.categories;

/**
 * Determines which categories are covered based on the configured source of truth.
 *
 * Three strategies:
 * - `'scoring'`: Uses the scoring engine's `status === 'assessed'` (pattern-match based)
 * - `'state_machine'`: Uses extraction confidence (medium/high from LLM)
 * - `'intersection'`: Both must agree for a category to be covered
 *
 * This function is a seam — swap the strategy via `CONFIG.coverageSource` without
 * changing any calling code. Useful for evaluation and A/B testing during development.
 *
 * @param currentCovered - Categories already marked as covered from previous turns
 * @param scoringResult - Result from calculateAllScores (scoring engine)
 * @param extraction - Current turn's LLM extraction (for state_machine strategy)
 * @returns Updated array of covered categories (monotonically increasing)
 */
export function determineCoveredCategories(
  currentCovered: CategoryName[],
  scoringResult: ScoringResultForCoverage,
  extraction: ExtractionForCoverage | null,
): CategoryName[] {
  const source = coverageSource;

  switch (source) {
    case 'scoring':
      return determineByScoringEngine(currentCovered, scoringResult);

    case 'state_machine':
      return determineByExtraction(currentCovered, extraction);

    case 'intersection':
      return determineByIntersection(currentCovered, scoringResult, extraction);

    default:
      return determineByScoringEngine(currentCovered, scoringResult);
  }
}

/**
 * Scoring engine strategy: category is covered when scoring status === 'assessed'.
 * Based on accumulated keyword pool pattern matching across all turns.
 */
function determineByScoringEngine(
  currentCovered: CategoryName[],
  scoringResult: ScoringResultForCoverage,
): CategoryName[] {
  const newCovered = new Set<CategoryName>(currentCovered);

  for (const cat of CATEGORY_ORDER) {
    const catScore = scoringResult.scores[cat];
    if (catScore && catScore.status === 'assessed') {
      newCovered.add(cat);
    }
  }

  return [...newCovered];
}

/**
 * State machine strategy: category is covered when extraction has
 * at least one keyword with medium or high confidence.
 * Based on current turn's LLM extraction confidence.
 */
function determineByExtraction(
  currentCovered: CategoryName[],
  extraction: ExtractionForCoverage | null,
): CategoryName[] {
  const newCovered = new Set<CategoryName>(currentCovered);

  if (!extraction) return [...newCovered];

  for (const cat of CATEGORY_ORDER) {
    const keywords = extraction[cat];
    if (!keywords || keywords.length === 0) continue;

    const hasMediumOrHigh = keywords.some(
      (kw) => kw.confidence === 'medium' || kw.confidence === 'high',
    );
    if (hasMediumOrHigh) {
      newCovered.add(cat);
    }
  }

  return [...newCovered];
}

/**
 * Intersection strategy: category is covered only when BOTH
 * scoring engine marks it assessed AND extraction has medium/high confidence.
 * Most conservative — reduces false positives but may slow session progress.
 */
function determineByIntersection(
  currentCovered: CategoryName[],
  scoringResult: ScoringResultForCoverage,
  extraction: ExtractionForCoverage | null,
): CategoryName[] {
  const newCovered = new Set<CategoryName>(currentCovered);

  if (!extraction) {
    // Without extraction, can only use scoring for already-covered categories
    return [...newCovered];
  }

  for (const cat of CATEGORY_ORDER) {
    if (newCovered.has(cat)) continue;

    const scoringAssessed =
      scoringResult.scores[cat] && scoringResult.scores[cat].status === 'assessed';

    const keywords = extraction[cat];
    const extractionConfident =
      keywords &&
      keywords.length > 0 &&
      keywords.some((kw) => kw.confidence === 'medium' || kw.confidence === 'high');

    if (scoringAssessed && extractionConfident) {
      newCovered.add(cat);
    }
  }

  return [...newCovered];
}
