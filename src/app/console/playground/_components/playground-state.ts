import type { PlaygroundResult } from './PlaygroundContext';

/**
 * Builds the messages array for a single-shot API call.
 * Single-shot mode always sends exactly 1 user message — no history accumulation.
 */
export function buildSingleShotMessages(
  userMessage: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return [{ role: 'user', content: userMessage }];
}

/**
 * Adds a new result to the results list, maintaining reverse-chronological order
 * (newest first). The new result is always prepended.
 */
export function addResult(
  results: PlaygroundResult[],
  newResult: PlaygroundResult,
): PlaygroundResult[] {
  return [newResult, ...results];
}

/**
 * Checks if a results array is sorted in reverse-chronological order.
 * Returns true if for all i < j: results[i].timestamp >= results[j].timestamp
 */
export function isReverseChronological(results: PlaygroundResult[]): boolean {
  for (let i = 0; i < results.length - 1; i++) {
    const current = results[i];
    const next = results[i + 1];
    if (current && next && current.timestamp < next.timestamp) {
      return false;
    }
  }
  return true;
}
