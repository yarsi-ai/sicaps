/**
 * Coverage module for Screening Chat V2.
 *
 * Manages which dimensions are filled/unfilled.
 * Append-only merge with correction support.
 * Pure functions — no I/O, immutable operations.
 *
 * Requirements: 8.2, 3.3
 */

/**
 * Current state of dimension coverage during a screening session.
 */
export interface CoverageState {
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
}

/**
 * Extraction output for dimension keywords from a single turn.
 */
export interface DimensionExtraction {
  dimensi: Record<string, { keywords: string[]; negasi?: string[] }>;
}

/**
 * Correction request: cancel a keyword and optionally replace it.
 */
export interface Correction {
  dimensi: string;
  keywordDibatalkan: string;
  keywordPengganti: string | null;
}

/**
 * Merge new extraction into existing coverage state.
 *
 * Append-only semantics:
 * - If dimension is in dimensiBelum, move it to dimensiTerisi and add keywords
 * - If dimension is already in dimensiTerisi, APPEND new keywords (no overwrite)
 * - Ignore duplicate keywords (deduplicate)
 * - Handle negasi the same way
 * - Returns new state (immutable — never mutates input)
 */
export function mergeCoverage(
  state: CoverageState,
  extraction: DimensionExtraction,
): CoverageState {
  let dimensiTerisi = { ...state.dimensiTerisi };
  let dimensiBelum = [...state.dimensiBelum];

  for (const [dimensi, data] of Object.entries(extraction.dimensi)) {
    const newKeywords = data.keywords;
    const newNegasi = data.negasi ?? [];

    // Skip if no data to add
    if (newKeywords.length === 0 && newNegasi.length === 0) {
      continue;
    }

    const existing = dimensiTerisi[dimensi];

    if (existing) {
      // Dimension already in dimensiTerisi — append, deduplicate
      const mergedKeywords = deduplicateAppend(existing.keywords, newKeywords);
      const mergedNegasi = deduplicateAppend(existing.negasi, newNegasi);

      dimensiTerisi = {
        ...dimensiTerisi,
        [dimensi]: { keywords: mergedKeywords, negasi: mergedNegasi },
      };
    } else {
      // Dimension is new — move from dimensiBelum to dimensiTerisi
      dimensiBelum = dimensiBelum.filter((d) => d !== dimensi);

      dimensiTerisi = {
        ...dimensiTerisi,
        [dimensi]: {
          keywords: [...new Set(newKeywords)],
          negasi: [...new Set(newNegasi)],
        },
      };
    }
  }

  return { dimensiTerisi, dimensiBelum };
}

/**
 * Apply a single correction to coverage state.
 *
 * Validates that keywordDibatalkan exists in dimensiTerisi[dimensi].keywords.
 * If invalid: returns unchanged state with changed=false.
 * If valid: removes keyword, optionally adds replacement.
 */
export function applyCorrection(
  state: CoverageState,
  correction: Correction,
): { state: CoverageState; changed: boolean } {
  const { dimensi, keywordDibatalkan, keywordPengganti } = correction;

  const existing = state.dimensiTerisi[dimensi];

  // Validate: dimension must exist in dimensiTerisi
  if (!existing) {
    return { state, changed: false };
  }

  // Validate: keyword must exist in dimension's keywords
  if (!existing.keywords.includes(keywordDibatalkan)) {
    return { state, changed: false };
  }

  // Remove the cancelled keyword
  let updatedKeywords = existing.keywords.filter((k) => k !== keywordDibatalkan);

  // Optionally add replacement (deduplicate)
  if (keywordPengganti !== null && !updatedKeywords.includes(keywordPengganti)) {
    updatedKeywords = [...updatedKeywords, keywordPengganti];
  }

  const updatedDimension = {
    keywords: updatedKeywords,
    negasi: existing.negasi,
  };

  const dimensiTerisi = {
    ...state.dimensiTerisi,
    [dimensi]: updatedDimension,
  };

  return {
    state: { dimensiTerisi, dimensiBelum: state.dimensiBelum },
    changed: true,
  };
}

/**
 * Check if all dimensions have been covered.
 *
 * Coverage is complete when no dimensions remain in dimensiBelum.
 */
export function isCoverageComplete(state: CoverageState): boolean {
  return state.dimensiBelum.length === 0;
}

// --- Internal helpers ---

/**
 * Append new items to existing array, deduplicating.
 */
function deduplicateAppend(existing: string[], additions: string[]): string[] {
  const set = new Set(existing);
  for (const item of additions) {
    set.add(item);
  }
  return [...set];
}
