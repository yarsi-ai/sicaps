/**
 * Shared types for keyword tables across locales.
 *
 * Used by domain/keywords/id.ts and domain/keywords/en.ts.
 */

import type { DimensionName } from '../types';

/**
 * A single keyword entry with canonical form, aliases (for prompt injection),
 * and score (1–3 for positive, negative for penalty).
 */
export interface KeywordEntry {
  canonical: string;
  aliases: string[];
  score: number;
}

/**
 * Flat scoring lookup: dimension → keyword → score.
 * Includes 'negatif' as a pseudo-dimension for penalty keywords.
 */
export type ScoringTable = Record<DimensionName | 'negatif', Record<string, number>>;

/**
 * Structured keyword table: dimension → array of KeywordEntry.
 * Used for prompt injection (canonical + aliases).
 */
export type KeywordTable = Record<DimensionName | 'negatif', KeywordEntry[]>;

/**
 * Canonical keyword list per dimension (for validator filtering).
 */
export type CanonicalList = Record<DimensionName | 'negatif', string[]>;
