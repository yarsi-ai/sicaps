/**
 * Keyword extraction validator.
 *
 * Filters extracted keywords against canonical tables per locale.
 * Matches against canonical names, aliases, AND extraction prompt keywords.
 * Keywords not found in any known form are dropped and collected
 * for UnmappedPhrase tracking.
 *
 * Pure function — no I/O.
 */

import { KEYWORD_TABLE } from '../keywords/id';
import { KEYWORD_TABLE as KEYWORD_TABLE_EN } from '../keywords/en';
import { getPromptKeywordList } from '../keywords/prompt-keywords';
import type { KeywordTable } from '../keywords/types';

export interface ValidationResult {
  valid: Record<string, { keywords: string[]; negasi: string[] }>;
  dropped: string[];
}

/**
 * Build expanded keyword set for a dimension: canonical + aliases + prompt keywords.
 */
function buildExpandedSet(
  keywordTable: KeywordTable,
  promptKeywords: Record<string, string[]>,
  dimension: string,
): Set<string> {
  const set = new Set<string>();

  const entries = keywordTable[dimension as keyof KeywordTable];
  if (entries) {
    for (const entry of entries) {
      set.add(entry.canonical.toLowerCase());
      for (const alias of entry.aliases) {
        set.add(alias.toLowerCase());
      }
    }
  }

  const promptKws = promptKeywords[dimension];
  if (promptKws) {
    for (const kw of promptKws) {
      set.add(kw.toLowerCase());
    }
  }

  return set;
}

/**
 * Validate extracted keywords against all known forms for the locale.
 *
 * A keyword passes if it matches (case-insensitive) ANY of:
 * - Canonical names
 * - Aliases
 * - Extraction prompt keywords for the same locale
 *
 * The prompt keyword set is locale-matched on purpose: the extraction prompt
 * offers the LLM this exact vocabulary, so validating an English session
 * against Indonesian slang would drop every keyword the model was told to use.
 *
 * Keywords in an unknown dimension are all dropped.
 * Negasi keywords are validated against the `negatif` dimension.
 * Only dimensions with at least one valid keyword or negasi are included in `valid`.
 */
export function validateExtraction(
  extraction: Record<string, { keywords: string[]; negasi?: string[] }>,
  locale: 'id' | 'en',
): ValidationResult {
  const keywordTable: KeywordTable = locale === 'id' ? KEYWORD_TABLE : KEYWORD_TABLE_EN;
  const promptKeywords = getPromptKeywordList(locale);
  const valid: Record<string, { keywords: string[]; negasi: string[] }> = {};
  const dropped: string[] = [];

  for (const [dimensi, data] of Object.entries(extraction)) {
    // Check if dimension exists
    const expandedSet = buildExpandedSet(keywordTable, promptKeywords, dimensi);

    if (expandedSet.size === 0 && !promptKeywords[dimensi]) {
      // Unknown dimension — drop all its keywords
      dropped.push(...data.keywords, ...(data.negasi ?? []));
      continue;
    }

    const validKeywords = data.keywords.filter((k) => {
      if (expandedSet.has(k.toLowerCase())) return true;
      dropped.push(k);
      return false;
    });

    // Negasi validated against 'negatif' dimension
    const negatifSet = buildExpandedSet(keywordTable, promptKeywords, 'negatif');
    const validNegasi = (data.negasi ?? []).filter((k) => {
      if (negatifSet.has(k.toLowerCase())) return true;
      dropped.push(k);
      return false;
    });

    if (validKeywords.length > 0 || validNegasi.length > 0) {
      valid[dimensi] = { keywords: validKeywords, negasi: validNegasi };
    }
  }

  return { valid, dropped };
}
