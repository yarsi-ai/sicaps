/**
 * Domain-specific configuration for scoring and risk assessment.
 * Extracted from src/lib/config.ts — self-contained, no external imports.
 */

export const SCORING_CONFIG = {
  riskThresholds: {
    LOW_MAX: 3,
    MODERATE_MAX: 6,
  },
  categories: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'] as const,
  i18n: {
    SUPPORTED_LOCALES: ['id', 'en'] as const,
  },
} as const;

export type ScoringCategory = (typeof SCORING_CONFIG.categories)[number];

export type SupportedLocale = (typeof SCORING_CONFIG.i18n.SUPPORTED_LOCALES)[number];

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

/**
 * Determines the source of truth for category coverage.
 * - 'scoring': Scoring engine's `status === 'assessed'` (default, pattern-match based)
 * - 'state_machine': State machine extraction confidence (medium/high from LLM)
 * - 'intersection': Both must agree for a category to be marked covered
 */
export const coverageSource: CoverageSource = 'scoring';

export type CoverageSource = 'scoring' | 'state_machine' | 'intersection';

/**
 * Determine risk level from total score.
 * Pure function — no I/O.
 */
export function getRiskLevel(totalScore: number): RiskLevel {
  if (totalScore <= SCORING_CONFIG.riskThresholds.LOW_MAX) return 'LOW';
  if (totalScore <= SCORING_CONFIG.riskThresholds.MODERATE_MAX) return 'MODERATE';
  return 'HIGH';
}
