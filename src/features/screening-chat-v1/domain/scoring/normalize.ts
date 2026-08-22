/**
 * Normalize a keyword string for scoring comparison.
 *
 * Algorithm: toLowerCase → trim → collapse whitespace → strip trailing punctuation → trim again
 * Pure function, zero dependencies, idempotent.
 */
export function normalize(keyword: string): string {
  const result = keyword
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:]+$/, '')
    .trim(); // Second trim ensures idempotence when punctuation leaves trailing space

  return result;
}
