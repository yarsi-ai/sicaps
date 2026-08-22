// Feature: visual-detection, Property 4: Retry Attempt State Machine Correctness
/**
 * Property-based tests for the attempt runner state machine.
 *
 * **Property 4: Retry Attempt State Machine Correctness**
 *
 * For all sequences of up to 3 attempt outcomes (each either success or failure),
 * evaluating the sequence SHALL:
 * - stop and report success at the index of the first successful outcome if one
 *   exists within the first 3 attempts
 * - otherwise, after exactly 3 failed outcomes, report exhaustion with no successful attempt
 *
 * **Validates: Requirements 7.1, 7.3, 8.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluateAttempts, AttemptOutcome } from './attempt-runner';

/**
 * Arbitrary for a single attempt outcome (success or failure).
 */
const attemptOutcomeArb: fc.Arbitrary<AttemptOutcome> = fc.record({
  success: fc.boolean(),
});

/**
 * Arbitrary for a sequence of 0-5 attempt outcomes (allowing testing beyond the 3-limit).
 */
const outcomeSequenceArb: fc.Arbitrary<AttemptOutcome[]> = fc.array(attemptOutcomeArb, {
  minLength: 0,
  maxLength: 5,
});

/**
 * Arbitrary for exactly 3 failed outcomes.
 */
const threeFailuresArb: fc.Arbitrary<AttemptOutcome[]> = fc.constant([
  { success: false },
  { success: false },
  { success: false },
]);

/**
 * Generates a sequence where the first success is at a specific position (1-indexed).
 * All outcomes before that position are failures.
 */
function firstSuccessAtPositionArb(position: 1 | 2 | 3): fc.Arbitrary<AttemptOutcome[]> {
  const failures = Array.from({ length: position - 1 }, () => ({ success: false }));
  return fc
    .array(attemptOutcomeArb, { minLength: 0, maxLength: 3 - position })
    .map((trailing) => [...failures, { success: true }, ...trailing]);
}

describe('Feature: visual-detection, Property 4: Retry Attempt State Machine Correctness', () => {
  /**
   * Property 4.1: If any of the first 3 outcomes is success, `succeededAtAttempt`
   * equals the 1-indexed position of the first success.
   *
   * Validates: Requirement 7.3
   */
  it('succeededAtAttempt equals the 1-indexed position of the first success within 3 attempts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }).chain((position) =>
          firstSuccessAtPositionArb(position as 1 | 2 | 3).map((outcomes) => ({
            expectedPosition: position,
            outcomes,
          })),
        ),
        ({ expectedPosition, outcomes }) => {
          const result = evaluateAttempts(outcomes);

          // The succeededAtAttempt must match the expected 1-indexed position
          expect(result.succeededAtAttempt).toBe(expectedPosition);
          // Should not be exhausted since we have a success
          expect(result.exhausted).toBe(false);
          // attemptsUsed equals the position of the first success
          expect(result.attemptsUsed).toBe(expectedPosition);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.2: If all 3 outcomes are failures, `exhausted` is true and
   * `succeededAtAttempt` is null.
   *
   * Validates: Requirements 7.1, 8.1
   */
  it('reports exhaustion with no success when all 3 attempts fail', () => {
    fc.assert(
      fc.property(threeFailuresArb, (outcomes) => {
        const result = evaluateAttempts(outcomes);

        expect(result.exhausted).toBe(true);
        expect(result.succeededAtAttempt).toBeNull();
        expect(result.attemptsUsed).toBe(3);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.3: Outcomes beyond the 3rd are ignored.
   *
   * Validates: Requirement 7.1 (up to 3 attempts total)
   */
  it('ignores outcomes beyond the 3rd attempt', () => {
    fc.assert(
      fc.property(
        // Generate 3 failures followed by 1-2 additional outcomes (including successes)
        fc
          .array(attemptOutcomeArb, { minLength: 1, maxLength: 2 })
          .map((extras) => [{ success: false }, { success: false }, { success: false }, ...extras]),
        (outcomes) => {
          const result = evaluateAttempts(outcomes);

          // Even if 4th or 5th outcome is success, the result should be exhausted
          expect(result.exhausted).toBe(true);
          expect(result.succeededAtAttempt).toBeNull();
          expect(result.attemptsUsed).toBe(3);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.4: For any sequence, if there's a success in the first 3,
   * we stop there and don't process further outcomes.
   *
   * Validates: Requirement 7.3 (stop retrying on first success)
   */
  it('stops processing at first success even if more outcomes exist', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 1, max: 3 }), // position of first success
            fc.array(attemptOutcomeArb, { minLength: 0, maxLength: 3 }), // trailing outcomes
          )
          .map(([position, trailing]) => {
            const beforeSuccess = Array.from({ length: position - 1 }, () => ({ success: false }));
            return {
              position,
              outcomes: [...beforeSuccess, { success: true }, ...trailing],
            };
          }),
        ({ position, outcomes }) => {
          const result = evaluateAttempts(outcomes);

          // Should stop at first success
          expect(result.succeededAtAttempt).toBe(position);
          expect(result.attemptsUsed).toBe(position);
          expect(result.exhausted).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.5: exhausted is true if and only if exactly 3 failed outcomes
   * were processed with no success.
   *
   * Validates: Requirements 7.1, 8.1
   */
  it('exhausted is true iff 3 failures processed with no success', () => {
    fc.assert(
      fc.property(outcomeSequenceArb, (outcomes) => {
        const result = evaluateAttempts(outcomes);

        // Find index of first success in first 3 outcomes
        const firstThree = outcomes.slice(0, 3);
        const firstSuccessIndex = firstThree.findIndex((o) => o.success);

        if (firstSuccessIndex !== -1) {
          // Found success in first 3: not exhausted
          expect(result.exhausted).toBe(false);
          expect(result.succeededAtAttempt).toBe(firstSuccessIndex + 1);
        } else if (firstThree.length < 3) {
          // Fewer than 3 outcomes and all failures: not exhausted yet
          expect(result.exhausted).toBe(false);
          expect(result.succeededAtAttempt).toBeNull();
        } else {
          // Exactly 3 failures: exhausted
          expect(result.exhausted).toBe(true);
          expect(result.succeededAtAttempt).toBeNull();
          expect(result.attemptsUsed).toBe(3);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.6: attemptsUsed is always <= 3 and reflects the actual number
   * of outcomes processed (stopping at first success or at 3).
   *
   * Validates: Requirement 7.1
   */
  it('attemptsUsed is bounded by 3 and reflects processed count', () => {
    fc.assert(
      fc.property(outcomeSequenceArb, (outcomes) => {
        const result = evaluateAttempts(outcomes);

        // attemptsUsed must be at most 3
        expect(result.attemptsUsed).toBeLessThanOrEqual(3);
        // attemptsUsed must be non-negative
        expect(result.attemptsUsed).toBeGreaterThanOrEqual(0);

        // Calculate expected attemptsUsed
        const firstThree = outcomes.slice(0, 3);
        const firstSuccessIndex = firstThree.findIndex((o) => o.success);

        if (firstSuccessIndex !== -1) {
          expect(result.attemptsUsed).toBe(firstSuccessIndex + 1);
        } else {
          expect(result.attemptsUsed).toBe(Math.min(outcomes.length, 3));
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.7: succeededAtAttempt when non-null is always 1, 2, or 3.
   *
   * Validates: Requirement 7.1, 7.3
   */
  it('succeededAtAttempt is 1, 2, or 3 when success occurs', () => {
    fc.assert(
      fc.property(outcomeSequenceArb, (outcomes) => {
        const result = evaluateAttempts(outcomes);

        if (result.succeededAtAttempt !== null) {
          expect(result.succeededAtAttempt).toBeGreaterThanOrEqual(1);
          expect(result.succeededAtAttempt).toBeLessThanOrEqual(3);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.8: Empty outcomes array yields not exhausted, null success, 0 attempts.
   *
   * Edge case for partial sequences.
   */
  it('handles empty outcomes correctly (no exhaustion, no success)', () => {
    fc.assert(
      fc.property(fc.constant<AttemptOutcome[]>([]), (outcomes) => {
        const result = evaluateAttempts(outcomes);

        expect(result.exhausted).toBe(false);
        expect(result.succeededAtAttempt).toBeNull();
        expect(result.attemptsUsed).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4.9: Determinism - same input always produces same output.
   *
   * Validates pure function behavior.
   */
  it('is deterministic - same outcomes produce same result', () => {
    fc.assert(
      fc.property(outcomeSequenceArb, (outcomes) => {
        const result1 = evaluateAttempts(outcomes);
        const result2 = evaluateAttempts(outcomes);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 },
    );
  });
});
