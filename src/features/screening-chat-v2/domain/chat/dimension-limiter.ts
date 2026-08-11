/**
 * Dimension Attempt Limiter
 *
 * Tracks how many turns each non-chips dimension has been "pending" (in dimensiBelum).
 * After MAX_DIMENSION_ATTEMPTS turns without being filled, the dimension is skipped.
 *
 * In-memory only — resets on session resume (acceptable: already-filled dims are safe).
 * Pure functions — no I/O.
 */

import { CHIPS_EXCLUSIVE_DIMENSIONS } from '../config';

/** Maximum turns a dimension can stay unfilled before being skipped. */
export const MAX_DIMENSION_ATTEMPTS = 6;

/** Counter map: dimension name → number of turns it's been pending. */
export type DimensionAttempts = Record<string, number>;

// ---------------------------------------------------------------------------
// In-memory store (per-session, resets on server restart / session resume)
// ---------------------------------------------------------------------------

const sessionAttempts = new Map<string, DimensionAttempts>();

/**
 * Get current attempts for a session (or empty if new/reset).
 */
export function getAttempts(sessionId: string): DimensionAttempts {
  return sessionAttempts.get(sessionId) ?? {};
}

/**
 * Increment attempt counters for all composable dimensions still in dimensiBelum.
 *
 * Only tracks non-chips dimensions (intensitas, waktu, lesi).
 * Persists in module-level Map.
 */
export function incrementAttempts(sessionId: string, dimensiBelum: string[]): DimensionAttempts {
  const current = getAttempts(sessionId);
  const updated = { ...current };

  for (const dim of dimensiBelum) {
    if (CHIPS_EXCLUSIVE_DIMENSIONS.includes(dim)) continue;
    updated[dim] = (updated[dim] ?? 0) + 1;
  }

  sessionAttempts.set(sessionId, updated);
  return updated;
}

/**
 * Determine which dimensions should be skipped (exceeded max attempts).
 */
export function getSkippedDimensions(
  attempts: DimensionAttempts,
  dimensiBelum: string[],
): string[] {
  return dimensiBelum.filter((dim) => {
    if (CHIPS_EXCLUSIVE_DIMENSIONS.includes(dim)) return false;
    return (attempts[dim] ?? 0) >= MAX_DIMENSION_ATTEMPTS;
  });
}

/**
 * Apply skips: move exceeded dimensions from dimensiBelum to dimensiTerisi.
 * Skipped dimensions get: { keywords: [], negasi: [], skipped: true }
 */
export function applyDimensionSkips(
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[]; skipped?: boolean }>,
  dimensiBelum: string[],
  skippedDims: string[],
): {
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[]; skipped?: boolean }>;
  dimensiBelum: string[];
} {
  if (skippedDims.length === 0) return { dimensiTerisi, dimensiBelum };

  const updatedTerisi = { ...dimensiTerisi };
  let updatedBelum = [...dimensiBelum];

  for (const dim of skippedDims) {
    updatedTerisi[dim] = { keywords: [], negasi: [], skipped: true };
    updatedBelum = updatedBelum.filter((d) => d !== dim);
  }

  return { dimensiTerisi: updatedTerisi, dimensiBelum: updatedBelum };
}

/**
 * Clear attempts for a session (on session completion or cleanup).
 */
export function clearAttempts(sessionId: string): void {
  sessionAttempts.delete(sessionId);
}
