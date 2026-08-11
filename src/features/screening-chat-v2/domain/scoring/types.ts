/**
 * Types for the scoring engine.
 *
 * The canonical ScoringResult is now defined in engine.ts.
 * This file re-exports it for barrel compatibility and retains
 * legacy Extraction types used by the validator.
 */

export type { ScoringResult } from './engine';

/**
 * Per-dimension extraction data containing detected keywords and negations.
 * Used by the extraction validator (not scoring).
 */
export interface DimensionExtraction {
  keywords: string[];
  negasi?: string[];
}

/**
 * Full extraction result from LLM, grouped by dimension.
 * `negasi` at top level holds negative/penalty keywords.
 * Used by the extraction validator (not scoring).
 */
export interface Extraction {
  dimensi: Record<string, DimensionExtraction>;
  negasi: string[];
}
