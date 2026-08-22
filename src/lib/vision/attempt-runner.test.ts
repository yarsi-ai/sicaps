import { describe, it, expect } from 'vitest';
import { evaluateAttempts, AttemptOutcome } from './attempt-runner';

describe('evaluateAttempts', () => {
  it('returns success on first attempt when first outcome is success', () => {
    const outcomes: AttemptOutcome[] = [{ success: true }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: 1,
      attemptsUsed: 1,
      exhausted: false,
    });
  });

  it('returns success on second attempt when first fails and second succeeds', () => {
    const outcomes: AttemptOutcome[] = [{ success: false }, { success: true }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: 2,
      attemptsUsed: 2,
      exhausted: false,
    });
  });

  it('returns success on third attempt when first two fail and third succeeds', () => {
    const outcomes: AttemptOutcome[] = [{ success: false }, { success: false }, { success: true }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: 3,
      attemptsUsed: 3,
      exhausted: false,
    });
  });

  it('returns exhausted when all three attempts fail', () => {
    const outcomes: AttemptOutcome[] = [{ success: false }, { success: false }, { success: false }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: null,
      attemptsUsed: 3,
      exhausted: true,
    });
  });

  it('ignores outcomes beyond the third attempt', () => {
    const outcomes: AttemptOutcome[] = [
      { success: false },
      { success: false },
      { success: false },
      { success: true }, // 4th attempt - should be ignored
    ];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: null,
      attemptsUsed: 3,
      exhausted: true,
    });
  });

  it('stops at first success even if more outcomes are provided', () => {
    const outcomes: AttemptOutcome[] = [
      { success: true },
      { success: false }, // should not be processed
      { success: true }, // should not be processed
    ];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: 1,
      attemptsUsed: 1,
      exhausted: false,
    });
  });

  it('handles empty outcomes array', () => {
    const outcomes: AttemptOutcome[] = [];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: null,
      attemptsUsed: 0,
      exhausted: false,
    });
  });

  it('handles single failed outcome (not exhausted)', () => {
    const outcomes: AttemptOutcome[] = [{ success: false }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: null,
      attemptsUsed: 1,
      exhausted: false,
    });
  });

  it('handles two failed outcomes (not exhausted)', () => {
    const outcomes: AttemptOutcome[] = [{ success: false }, { success: false }];
    const result = evaluateAttempts(outcomes);

    expect(result).toEqual({
      succeededAtAttempt: null,
      attemptsUsed: 2,
      exhausted: false,
    });
  });
});
