/**
 * Checkpoint builder for Screening Chat V2.
 *
 * Builds a compact session summary for follow-up context.
 * Pure function — no I/O, no side effects.
 */

import type { RiskLevel } from '../types';

/**
 * Scoring result from the scoring engine.
 * Defined here for forward compatibility until scoring/engine.ts (task 4.1) exists.
 */
export interface ScoringResult {
  total: number;
  riskLevel: RiskLevel;
  perDimension: Record<string, number>;
  penalty: number;
}

/**
 * Coverage state tracking filled/unfilled dimensions.
 * Defined here for forward compatibility until chat/coverage.ts (task 2.7) exists.
 */
export interface CoverageState {
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
}

/**
 * Compact session summary for checkpoint storage and follow-up context.
 */
export interface SessionSummary {
  totalScore: number;
  riskLevel: string;
  perDimension: Record<string, { keywords: string[]; score: number }>;
  perception: string;
  emosi: string | null;
}

/**
 * Build a compact session summary from clinical fields.
 *
 * Combines scoring result per-dimension scores with coverage state keywords
 * into a single summary object suitable for checkpoint persistence.
 *
 * @param scoringResult - Deterministic scoring output
 * @param coverageState - Current dimension coverage (filled keywords)
 * @param perception - User's self-perception of their condition
 * @param emosi - Detected emotional state (nullable)
 * @returns SessionSummary with combined per-dimension data
 */
export function buildSummary(
  scoringResult: ScoringResult,
  coverageState: CoverageState,
  perception: string,
  emosi: string | null,
): SessionSummary {
  const perDimension: Record<string, { keywords: string[]; score: number }> = {};

  for (const [dimensi, data] of Object.entries(coverageState.dimensiTerisi)) {
    perDimension[dimensi] = {
      keywords: data.keywords,
      score: scoringResult.perDimension[dimensi] ?? 0,
    };
  }

  return {
    totalScore: scoringResult.total,
    riskLevel: scoringResult.riskLevel,
    perDimension,
    perception,
    emosi,
  };
}
