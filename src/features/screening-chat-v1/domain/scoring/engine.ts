import { matchKeywords } from './matcher';
import { PATTERN_TABLE_ID } from '../keywords/id';
import { PATTERN_TABLE_EN } from '../keywords/en';
import { getRiskLevel } from '../config';
import type {
  PoolEntry,
  KeywordRule,
  CategoryScore,
  KeywordPool,
  ScoringResult,
  PillSelection,
  Locale,
  CategoryName,
  PatternTable,
  Pill,
} from '../keywords/types';

/** Dependency: resolve a pill by locale and ID. Injected to keep domain layer pure. */
export type PillResolver = (locale: Locale, pillId: string) => Pill | undefined;

const CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

/**
 * Calculate score for a single category from pool entries.
 * Delegates to matcher, applies floor-zero capping.
 */
export function calculateCategoryScore(
  pool: PoolEntry[],
  positiveRules: KeywordRule[],
  negativeRules: KeywordRule[],
): CategoryScore {
  const matchResult = matchKeywords(pool, positiveRules, negativeRules);

  const capped = Math.max(0, matchResult.score);

  const hasAssessedEntry = pool.some(
    (entry) => entry.confidence === 'high' || entry.confidence === 'medium',
  );
  const status = hasAssessedEntry ? 'assessed' : 'not_assessed';

  return {
    raw: matchResult.score,
    capped,
    status,
    matchedPatterns: matchResult.matchedPatterns,
    unmatchedKeywords: matchResult.unmatchedKeywords,
  };
}

/**
 * Calculate scores for all categories. Full recalculation from pool.
 * Selects pattern table by locale, aggregates all category scores,
 * determines risk level.
 */
export function calculateAllScores(pool: KeywordPool, locale: Locale): ScoringResult {
  const patternTable: PatternTable = locale === 'id' ? PATTERN_TABLE_ID : PATTERN_TABLE_EN;

  const scores = {} as Record<CategoryName, CategoryScore>;

  for (const category of CATEGORIES) {
    const positiveRules = patternTable.positive[category] as KeywordRule[];
    const negativeRules = (patternTable.negative[category] ?? []) as KeywordRule[];

    scores[category] = calculateCategoryScore(pool[category], positiveRules, negativeRules);
  }

  const totalScore = CATEGORIES.reduce((sum, cat) => sum + scores[cat].capped, 0);
  const riskLevel = getRiskLevel(totalScore);

  return {
    version: 'v1',
    scores,
    totalScore,
    riskLevel,
  };
}

/**
 * Calculate hybrid score combining AI keyword pool scores (covered categories)
 * with pill scores (uncovered categories).
 */
export function calculateHybridScore(
  pool: KeywordPool,
  pillSelections: PillSelection[],
  locale: Locale,
  pillResolver: PillResolver,
): ScoringResult {
  const patternTable: PatternTable = locale === 'id' ? PATTERN_TABLE_ID : PATTERN_TABLE_EN;

  const scores = {} as Record<CategoryName, CategoryScore>;

  for (const category of CATEGORIES) {
    const hasCoverage = pool[category].some(
      (entry) => entry.confidence === 'high' || entry.confidence === 'medium',
    );

    if (hasCoverage) {
      // AI-scored category
      const positiveRules = patternTable.positive[category] as KeywordRule[];
      const negativeRules = (patternTable.negative[category] ?? []) as KeywordRule[];
      scores[category] = calculateCategoryScore(pool[category], positiveRules, negativeRules);
    } else {
      // Check for pill selections in this category
      const categoryPills = pillSelections.filter((s) => s.category === category);

      if (categoryPills.length > 0) {
        const rawScore = categoryPills.reduce((sum, selection) => {
          const pill = pillResolver(locale, selection.pillId);
          return sum + (pill ? pill.score : 0);
        }, 0);

        const capped = Math.max(0, rawScore);

        scores[category] = {
          raw: rawScore,
          capped,
          status: 'assessed',
          matchedPatterns: [],
          unmatchedKeywords: [],
        };
      } else {
        scores[category] = {
          raw: 0,
          capped: 0,
          status: 'not_assessed',
          matchedPatterns: [],
          unmatchedKeywords: [],
        };
      }
    }
  }

  const totalScore = CATEGORIES.reduce((sum, cat) => sum + scores[cat].capped, 0);
  const riskLevel = getRiskLevel(totalScore);

  return {
    version: 'v1',
    scores,
    totalScore,
    riskLevel,
  };
}
