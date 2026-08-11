/**
 * Correction module for Screening Chat V2.
 *
 * Applies user self-corrections to coverage state.
 * Pure function — no I/O, no side effects, immutable operations.
 *
 * Requirements: 8.1, 8.2, 8.3
 */

/**
 * Coverage state tracking which dimensions are filled/unfilled.
 * Shared with coverage.ts — defined here for module independence.
 */
export interface CoverageState {
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
}

/**
 * A single user self-correction extracted by LLM.
 *
 * - dimensi: target dimension
 * - keywordDibatalkan: keyword to remove
 * - keywordPengganti: replacement keyword (null = remove only)
 */
export interface Correction {
  dimensi: string;
  keywordDibatalkan: string;
  keywordPengganti: string | null;
}

/**
 * Apply a batch of corrections to the coverage state.
 *
 * For each correction:
 * 1. Validate that `dimensi` exists in dimensiTerisi
 * 2. Validate that `keywordDibatalkan` exists in that dimension's keywords
 * 3. If valid: remove the cancelled keyword
 * 4. If keywordPengganti is non-null and not already present, add it
 * 5. If invalid: skip (dimension not found or keyword not found)
 *
 * Corrections are processed in order. Each is independent —
 * one invalid correction does not block subsequent ones.
 *
 * Returns `changed: true` if at least one correction was successfully applied.
 * Does NOT mutate the input state.
 */
export function applyCorrections(
  state: CoverageState,
  corrections: Correction[],
): { state: CoverageState; changed: boolean } {
  const current = deepCopyCoverage(state);
  let changed = false;

  for (const correction of corrections) {
    const dimensionData = current.dimensiTerisi[correction.dimensi];

    // Skip if dimension doesn't exist in dimensiTerisi
    if (!dimensionData) {
      continue;
    }

    const keywordIndex = dimensionData.keywords.indexOf(correction.keywordDibatalkan);

    // Skip if keyword not found in that dimension
    if (keywordIndex === -1) {
      continue;
    }

    // Remove the cancelled keyword
    dimensionData.keywords = dimensionData.keywords.filter(
      (k) => k !== correction.keywordDibatalkan,
    );

    // Add replacement if provided and not already present
    if (
      correction.keywordPengganti !== null &&
      !dimensionData.keywords.includes(correction.keywordPengganti)
    ) {
      dimensionData.keywords = [...dimensionData.keywords, correction.keywordPengganti];
    }

    changed = true;
  }

  return { state: current, changed };
}

/**
 * Deep copy coverage state to ensure immutability.
 */
function deepCopyCoverage(state: CoverageState): CoverageState {
  const dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }> = {};

  for (const [key, value] of Object.entries(state.dimensiTerisi)) {
    dimensiTerisi[key] = {
      keywords: [...value.keywords],
      negasi: [...value.negasi],
    };
  }

  return {
    dimensiTerisi,
    dimensiBelum: [...state.dimensiBelum],
  };
}
