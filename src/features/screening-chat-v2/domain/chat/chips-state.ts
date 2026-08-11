import type { ChipsSubState, ChipsType } from '../types';
import { CHIPS_ORDER, CHIPS_MIN_TURN_DELAY, CHIPS_TURN_GAP, DIMENSION_TO_CHIPS } from '../config';

export interface ChipsContext {
  subState: ChipsSubState;
  queue: ChipsType[];
  activeChips: ChipsType | null;
  answered: ChipsType[];
}

/**
 * Determine next chips sub-state after a chips answer is submitted.
 *
 * Preconditions: current subState is CHIPS_ACTIVE
 * Postconditions:
 *   - If queue has items → CHIPS_PENDING (next chips ready)
 *   - If queue empty → FREE_TEXT (resume normal flow)
 */
export function nextChipsSubState(ctx: ChipsContext): ChipsContext {
  const [next, ...rest] = ctx.queue;
  if (next) {
    return { subState: 'CHIPS_PENDING', queue: rest, activeChips: next, answered: ctx.answered };
  }
  return { subState: 'FREE_TEXT', queue: [], activeChips: null, answered: ctx.answered };
}

/**
 * Check if dimension touch should trigger chips.
 *
 * Enforces R1 (minimum turn delay) and R2 (gap between chips).
 *
 * Preconditions: dimensionsTouched contains newly touched dimensions
 * Postconditions: returns chips types to queue (empty if none needed or timing not met)
 */
export function checkChipsTrigger(
  dimensionsTouched: string[],
  alreadyAnswered: ChipsType[],
  turnCount?: number,
  lastChipsTurn?: number,
): ChipsType[] {
  // R1: Don't show chips before minimum turn threshold
  if (turnCount !== undefined && turnCount < CHIPS_MIN_TURN_DELAY) {
    return [];
  }

  // R2: Enforce gap between consecutive chips
  if (
    turnCount !== undefined &&
    lastChipsTurn !== undefined &&
    lastChipsTurn > 0 &&
    turnCount - lastChipsTurn < CHIPS_TURN_GAP + 1
  ) {
    return [];
  }

  return CHIPS_ORDER.filter((chipsType) => {
    const dimension = Object.entries(DIMENSION_TO_CHIPS).find(([, ct]) => ct === chipsType)?.[0];
    return (
      dimension && dimensionsTouched.includes(dimension) && !alreadyAnswered.includes(chipsType)
    );
  });
}

/**
 * Check if all required chips have been answered.
 */
export function allChipsAnswered(answered: ChipsType[]): boolean {
  return CHIPS_ORDER.every((ct) => answered.includes(ct));
}
