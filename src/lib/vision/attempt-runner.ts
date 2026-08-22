/**
 * Attempt runner for visual prediction retry logic.
 * Pure state-machine helper isolating the "retry up to 3 times, stop at first success"
 * logic so it can be property-tested independently of network I/O.
 *
 * This is a lib module — MUST NOT import Prisma or Next.js modules.
 * Requirements: 7.1, 7.3, 8.1, 13.1
 */

import { CONFIG } from '@/lib/config';

export interface AttemptOutcome {
  success: boolean;
}

export interface AttemptRunResult {
  /**
   * The 1-indexed position of the first successful attempt (1-3),
   * or null if all attempts failed.
   */
  succeededAtAttempt: number | null;
  /**
   * Total number of attempts that were processed.
   * This is always the index+1 of the last processed outcome.
   */
  attemptsUsed: number;
  /**
   * True if all MAX_PREDICTION_ATTEMPTS (3) were processed without success.
   * False if a success occurred before exhaustion or if fewer than 3 outcomes were provided.
   */
  exhausted: boolean;
}

/**
 * Given a sequence of up to 3 attempt outcomes (as they occur), determine
 * when to stop. Used by the service to decide whether to call the client
 * again — the service supplies outcomes one at a time via a callback-driven
 * loop; this function documents/verifies the stopping invariant in isolation.
 *
 * The logic:
 * - Process outcomes one by one, stopping at first success
 * - If any outcome is success, return `succeededAtAttempt` as 1-indexed position,
 *   `attemptsUsed` as the index+1, `exhausted` as false
 * - If all 3 fail (or fewer provided with all failures), `succeededAtAttempt` is null,
 *   `exhausted` is true only if 3 attempts processed
 * - Max 3 outcomes should be considered (additional outcomes are ignored)
 *
 * @param outcomes - Array of attempt outcomes (success/failure flags)
 * @returns Result indicating success position, attempts used, and exhaustion state
 *
 * Validates: Requirements 7.1, 7.3, 8.1
 */
export function evaluateAttempts(outcomes: AttemptOutcome[]): AttemptRunResult {
  const maxAttempts = CONFIG.visualDetection.MAX_PREDICTION_ATTEMPTS;

  // Limit to max attempts
  const limitedOutcomes = outcomes.slice(0, maxAttempts);

  // Process outcomes one by one, stopping at first success
  for (let i = 0; i < limitedOutcomes.length; i++) {
    const outcome = limitedOutcomes[i];
    if (outcome?.success) {
      return {
        succeededAtAttempt: i + 1, // 1-indexed
        attemptsUsed: i + 1,
        exhausted: false,
      };
    }
  }

  // No success found — determine if exhausted
  const attemptsUsed = limitedOutcomes.length;
  const exhausted = attemptsUsed >= maxAttempts;

  return {
    succeededAtAttempt: null,
    attemptsUsed,
    exhausted,
  };
}
