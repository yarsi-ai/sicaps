import { getPillById } from './pills';
import { getRiskLevel } from '../../domain/config';
import { ValidationError } from '@/lib/errors';
import type {
  PillSelection,
  Locale,
  ScoringResult,
  CategoryScore,
  CategoryName,
} from '../../domain/keywords/types';

const CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

/**
 * Calculate score from pill selections. Bypasses keyword pool entirely.
 * Groups selections by category, sums pill scores, applies floor zero per category.
 */
export function calculatePillScore(selections: PillSelection[], locale: Locale): ScoringResult {
  // Step 1: Validate all pill IDs exist for the given locale
  for (const selection of selections) {
    const pill = getPillById(locale, selection.pillId);
    if (!pill) {
      throw new ValidationError(`Invalid pill ID: ${selection.pillId}`);
    }
  }

  // Step 2: Group selections by category
  const grouped = new Map<CategoryName, PillSelection[]>();
  for (const selection of selections) {
    const existing = grouped.get(selection.category) ?? [];
    existing.push(selection);
    grouped.set(selection.category, existing);
  }

  // Step 3: Calculate per category
  const scores = {} as Record<CategoryName, CategoryScore>;

  for (const category of CATEGORIES) {
    const categorySelections = grouped.get(category);

    if (!categorySelections || categorySelections.length === 0) {
      scores[category] = {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      };
      continue;
    }

    // Sum pill scores for this category
    const rawScore = categorySelections.reduce((sum, selection) => {
      const pill = getPillById(locale, selection.pillId);
      return sum + (pill ? pill.score : 0);
    }, 0);

    // Step 4: Floor zero per category
    const capped = Math.max(0, rawScore);

    scores[category] = {
      raw: rawScore,
      capped,
      status: 'assessed',
      matchedPatterns: [],
      unmatchedKeywords: [],
    };
  }

  // Step 5: Total + risk level
  const totalScore = CATEGORIES.reduce((sum, cat) => sum + scores[cat].capped, 0);
  const riskLevel = getRiskLevel(totalScore);

  return {
    version: 'v1',
    scores,
    totalScore,
    riskLevel,
  };
}
