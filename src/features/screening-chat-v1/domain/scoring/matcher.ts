import { normalize } from './normalize';
import type { PoolEntry, KeywordRule, MatchResult } from '../keywords/types';

interface Candidate {
  pattern: string;
  rule: KeywordRule;
}

/**
 * Match eligible keywords against pattern table for one category.
 * Returns score, matched patterns, and unmatched keywords.
 *
 * Algorithm: filter confidence >= medium, sort longest first, substring match,
 * longest-match priority blocking, unique pattern deduplication.
 */
export function matchKeywords(
  entries: PoolEntry[],
  positiveRules: KeywordRule[],
  negativeRules: KeywordRule[],
): MatchResult {
  // Step 1: Filter — only confidence >= medium
  const eligible = entries.filter((e) => e.confidence === 'high' || e.confidence === 'medium');

  // Step 2: Sort by keyword length descending (longest match priority)
  const sorted = [...eligible].sort((a, b) => b.keyword.length - a.keyword.length);

  let totalScore = 0;
  const matchedPatterns = new Set<string>();
  const unmatchedKeywords: string[] = [];

  // Step 3: For each keyword
  for (const entry of sorted) {
    const normalized = normalize(entry.keyword);
    let keywordMatched = false;

    // Collect all candidate matches across all rules, sorted by pattern length desc
    const candidates: Candidate[] = [];

    for (const rule of positiveRules) {
      for (const pattern of rule.patterns) {
        if (normalized.includes(pattern) && !matchedPatterns.has(pattern)) {
          candidates.push({ pattern, rule });
        }
      }
    }

    for (const rule of negativeRules) {
      for (const pattern of rule.patterns) {
        if (normalized.includes(pattern) && !matchedPatterns.has(pattern)) {
          candidates.push({ pattern, rule });
        }
      }
    }

    // Sort candidates by pattern length descending (longest pattern first)
    candidates.sort((a, b) => b.pattern.length - a.pattern.length);

    // Greedy selection: longest first, one match per rule, with blocking
    const matchedRulesThisKeyword = new Set<KeywordRule>();

    for (const candidate of candidates) {
      // Skip if we already matched a pattern from this rule for this keyword
      if (matchedRulesThisKeyword.has(candidate.rule)) {
        continue;
      }

      // Longest match blocking: skip if pattern is substring of already-matched longer pattern
      const blocked = Array.from(matchedPatterns).some(
        (usedPattern) =>
          usedPattern.includes(candidate.pattern) && usedPattern !== candidate.pattern,
      );
      if (blocked) {
        continue;
      }

      totalScore += candidate.rule.score;
      matchedPatterns.add(candidate.pattern);
      matchedRulesThisKeyword.add(candidate.rule);
      keywordMatched = true;
    }

    if (!keywordMatched) {
      unmatchedKeywords.push(entry.keyword);
    }
  }

  return {
    score: totalScore,
    matchedPatterns: Array.from(matchedPatterns),
    unmatchedKeywords,
  };
}
