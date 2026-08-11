/**
 * Coverage accumulation utility for playground multi-turn sessions.
 * Extracts covered category names from LLM extraction results.
 *
 * Integration point: after multi-turn response, call
 * `updateCoverage(state.coverageAccumulator, response.extraction)`
 * and dispatch `{ type: 'COVERAGE_UPDATED', categories: result }`.
 */

/**
 * Updates the coverage accumulator with newly extracted categories.
 * Returns a deduplicated array of all covered categories.
 *
 * A category is considered "covered" when it has a non-empty keyword array
 * in the extraction result.
 *
 * @param currentCoverage - Previously accumulated category names
 * @param extraction - Extraction result from LLM response (or null for PARTIAL/FAILURE)
 * @returns Updated coverage array (deduplicated)
 */
export function updateCoverage(
  currentCoverage: string[],
  extraction: Record<string, Array<{ keyword: string; confidence: string | number }>> | null,
): string[] {
  if (!extraction) return currentCoverage;

  const newCategories = Object.entries(extraction)
    .filter(([_, keywords]) => Array.isArray(keywords) && keywords.length > 0)
    .map(([category]) => category);

  return [...new Set([...currentCoverage, ...newCategories])];
}
