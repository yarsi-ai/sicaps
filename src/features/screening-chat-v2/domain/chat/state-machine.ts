/**
 * State Machine for Screening Chat V2.
 *
 * Determines the next conversation phase based on session state.
 * Pure, deterministic — no I/O, no side effects.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { SessionPhase, ChipsType } from '../types';
import { TURN_LIMITS, STAGNATION_THRESHOLD, CHIPS_EXCLUSIVE_DIMENSIONS } from '../config';
import { allChipsAnswered } from './chips-state';

/**
 * Minimal snapshot of session state needed for phase transitions.
 */
export interface SessionSnapshot {
  phase: SessionPhase;
  dimensiBelum: string[];
  perception: string | null;
  hasilDitampilkan: boolean;
  crisisDetected: boolean;
  turnCount: number;
  partial: boolean;
  chipsAnswered: ChipsType[];
  stagnationCount?: number;
}

/**
 * Determine the next conversation phase from session state.
 *
 * Priority order:
 * 1. Crisis override → CLOSED
 * 2. Hard turn limit → CLOSED
 * 3. Soft completion (R5): stagnation on last dimension → ASKING_PERCEPTION
 * 4. Dimensions remaining OR chips incomplete → COLLECTING
 * 5. Perception missing → ASKING_PERCEPTION
 * 6. Result not shown → SCREENING_COMPLETE
 * 7. Otherwise → FOLLOW_UP
 */
export function nextPhase(s: SessionSnapshot): SessionPhase {
  if (s.crisisDetected) return 'CLOSED';
  if (s.turnCount >= TURN_LIMITS.hard) return 'CLOSED';

  // GREETING phase: transition to COLLECTING on first user message
  // (Greeting is generated at session creation, not during chat turns)
  if (s.phase === 'GREETING') {
    return 'COLLECTING';
  }

  // R5: Soft completion — if only 1 dimension remains and stagnation threshold reached,
  // skip that last dimension and move to perception (mark session partial)
  if (shouldSoftComplete(s)) return 'ASKING_PERCEPTION';

  // Check if still collecting: dimensions remain OR chips-exclusive dims filled but chips not answered
  // If all dimensiBelum empty AND all chips-exclusive dims are in dimensiTerisi, proceed regardless of chips status
  const chipsStillNeeded =
    !allChipsAnswered(s.chipsAnswered) &&
    CHIPS_EXCLUSIVE_DIMENSIONS.some((dim) => s.dimensiBelum.includes(dim));

  if (s.dimensiBelum.length > 0 || chipsStillNeeded) return 'COLLECTING';
  if (s.perception === null) return 'ASKING_PERCEPTION';
  if (!s.hasilDitampilkan) return 'SCREENING_COMPLETE';
  return 'FOLLOW_UP';
}

/**
 * Determine whether soft completion should trigger (R5).
 *
 * Conditions:
 * - Exactly 1 dimension remaining
 * - Stagnation count >= threshold (5 turns without new dimension fill)
 * - All chips are answered (or irrelevant to the stuck dimension)
 *
 * When triggered, the system force-transitions to ASKING_PERCEPTION,
 * accepting incomplete data rather than looping indefinitely.
 */
export function shouldSoftComplete(s: SessionSnapshot): boolean {
  const stagnation = s.stagnationCount ?? 0;
  return (
    s.dimensiBelum.length <= 1 &&
    stagnation >= STAGNATION_THRESHOLD &&
    allChipsAnswered(s.chipsAnswered)
  );
}

/**
 * Calculate stagnation: returns new stagnation count.
 *
 * If no new dimension was filled this turn → increment.
 * If a dimension was filled → reset to 0.
 *
 * Preconditions: previousDimensiBelum is the state BEFORE this turn's extraction
 * Postconditions: returns updated stagnation count
 */
export function updateStagnation(
  previousDimensiBelum: string[],
  currentDimensiBelum: string[],
  currentStagnation: number,
): number {
  const filled = previousDimensiBelum.length > currentDimensiBelum.length;
  return filled ? 0 : currentStagnation + 1;
}

/**
 * Determine whether the system should nudge the user toward completion.
 *
 * True when the soft turn limit is reached and there are still unfilled dimensions.
 */
export function shouldNudge(s: SessionSnapshot): boolean {
  return s.turnCount >= TURN_LIMITS.soft && s.dimensiBelum.length > 0;
}

/**
 * Check if a phase is terminal (session cannot continue).
 *
 * Only CLOSED is terminal.
 */
export function isTerminal(phase: SessionPhase): boolean {
  return phase === 'CLOSED';
}
