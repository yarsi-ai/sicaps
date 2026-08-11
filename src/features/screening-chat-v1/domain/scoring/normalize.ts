/**
 * Normalize a keyword string for scoring comparison.
 *
 * Algorithm: toLowerCase → trim → collapse whitespace → strip trailing punctuation
 * Pure function, zero dependencies, idempotent.
 */
export function normalize(keyword: string): string {
  const result = keyword
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:]+$/, '');

  return result;
}
