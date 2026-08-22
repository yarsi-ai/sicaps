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
  /**
   * Whether a visual result has been recorded for this session — a successful
   * prediction or the documented permanent-failure fallback.
   *
   * Optional and defaulting to resolved: callers that have nothing to do with
   * visual detection (v1, or any snapshot built before this field existed) must
   * not accidentally get parked in AWAITING_IMAGE.
   */
  imageResolved?: boolean;
}

/**
 * Determine the next conversation phase from session state.
 *
 * Priority order:
 * 1. Crisis override → CLOSED
 * 2. Hard turn limit → CLOSED
 * 3. Dimensions remaining OR chips incomplete → COLLECTING, unless soft
 *    completion (R5) releases the last stuck dimension
 * 4. Photo not yet resolved → AWAITING_IMAGE
 * 5. Perception missing → ASKING_PERCEPTION
 * 6. Result not shown → SCREENING_COMPLETE
 * 7. Otherwise → FOLLOW_UP
 *
 * Soft completion decides only whether COLLECTING is over. It deliberately does
 * not name a destination: an earlier version returned ASKING_PERCEPTION directly
 * from step 3, which meant a session whose perception was already known got sent
 * back to the perception phase on every turn and could never reach
 * SCREENING_COMPLETE. Stagnation never resets once every dimension is filled, so
 * that short-circuit latched on permanently.
 */
export function nextPhase(s: SessionSnapshot): SessionPhase {
  if (s.crisisDetected) return 'CLOSED';
  if (s.turnCount >= TURN_LIMITS.hard) return 'CLOSED';

  // GREETING phase: transition to COLLECTING on first user message
  // (Greeting is generated at session creation, not during chat turns)
  if (s.phase === 'GREETING') {
    return 'COLLECTING';
  }

  // Snapshots from callers that predate visual detection (and v1) leave this
  // unset; treating that as resolved keeps them out of the photo gate entirely.
  const imageResolved = s.imageResolved ?? true;

  // Check if still collecting: dimensions remain OR chips-exclusive dims filled but chips not answered
  // If all dimensiBelum empty AND all chips-exclusive dims are in dimensiTerisi, proceed regardless of chips status
  const chipsStillNeeded =
    !allChipsAnswered(s.chipsAnswered) &&
    CHIPS_EXCLUSIVE_DIMENSIONS.some((dim) => s.dimensiBelum.includes(dim));

  // R5: soft completion abandons the one dimension the conversation is stuck on
  // rather than looping on it. It skips a dimension, never the photo — the photo
  // is mandatory regardless of how collecting ended, so stagnation must not
  // become a way around the gate.
  const stillCollecting = (s.dimensiBelum.length > 0 || chipsStillNeeded) && !shouldSoftComplete(s);

  if (stillCollecting) return 'COLLECTING';
  if (!imageResolved) return 'AWAITING_IMAGE';
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
 * When triggered, collecting ends and that last dimension is abandoned, marking
 * the session partial rather than looping on a question the santri will not
 * answer.
 *
 * The dimension count is `=== 1`, not `<= 1`, and that is load-bearing. Zero
 * remaining dimensions is not stagnation, it is success — the ordinary path
 * already moves such a session on. Counting it as soft completion made this
 * predicate true forever after collecting finished, because `updateStagnation`
 * can never reset once there is nothing left to fill.
 */
export function shouldSoftComplete(s: SessionSnapshot): boolean {
  const stagnation = s.stagnationCount ?? 0;
  return (
    s.dimensiBelum.length === 1 &&
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
