import type {
  KeywordPool,
  CategoryExtraction,
  CategoryName,
  Confidence,
  PoolEntry,
} from '../keywords/types';
import { normalize } from './normalize';

const CONFIDENCE_VALUE: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

/**
 * Compare two confidence levels. Returns true if `a` is strictly higher than `b`.
 */
function isHigherConfidence(a: Confidence, b: Confidence): boolean {
  return CONFIDENCE_VALUE[a] > CONFIDENCE_VALUE[b];
}

/**
 * Append extracted keywords to pool. Deduplicate by normalized form,
 * upgrade confidence if higher. Returns new pool (immutable).
 *
 * Defensive: never throws. Handles undefined/null categories gracefully.
 */
export function appendToPool(
  pool: KeywordPool,
  extraction: CategoryExtraction,
  turn: number,
): KeywordPool {
  const result: KeywordPool = { ...pool };

  for (const category of CATEGORIES) {
    const existingEntries = pool[category] ?? [];
    const newKeywords = extraction[category];

    // Defensive: skip undefined/null categories (incomplete extraction data)
    if (!newKeywords || !Array.isArray(newKeywords)) {
      console.warn(`[scoring] appendToPool: category "${category}" is undefined/invalid, skipping`);
      result[category] = [...existingEntries];
      continue;
    }

    if (newKeywords.length === 0) {
      // No changes for this category — shallow copy the array
      result[category] = [...existingEntries];
      continue;
    }

    // Start with copies of existing entries
    const updatedEntries: PoolEntry[] = existingEntries.map((entry) => ({
      ...entry,
    }));

    for (const extracted of newKeywords) {
      const normalizedNew = normalize(extracted.keyword);

      // Skip empty normalizations
      if (normalizedNew === '') continue;

      const existingIndex = updatedEntries.findIndex(
        (entry) => normalize(entry.keyword) === normalizedNew,
      );

      if (existingIndex >= 0) {
        // Duplicate found — upgrade confidence if higher
        const existing = updatedEntries[existingIndex]!;
        if (isHigherConfidence(extracted.confidence, existing.confidence)) {
          updatedEntries[existingIndex] = {
            ...existing,
            confidence: extracted.confidence,
          };
        }
      } else {
        // New keyword — add to pool
        updatedEntries.push({
          keyword: extracted.keyword,
          confidence: extracted.confidence,
          turn,
          matched: false,
          matchedPattern: null,
        });
      }
    }

    result[category] = updatedEntries;
  }

  return result;
}
