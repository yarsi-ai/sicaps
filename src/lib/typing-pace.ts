/**
 * Pacing for bot turns that are not composed by an LLM.
 *
 * Most bot turns inherit a natural pause from the model call in front of them.
 * The ones built from fixed copy have no such pause, so they arrive the instant
 * the santri acts and read as system notices rather than as Capi talking.
 *
 * Pure on purpose: both the server chat pipeline and the client chat hook need
 * this number, and a second copy of the arithmetic would let the two rhythms
 * drift apart.
 */

import { CONFIG } from './config';

/**
 * How long a bot turn of this length should appear to take.
 *
 * Scales with length so a short acknowledgement is not held back as long as a
 * paragraph, then clamps so nothing stalls the conversation.
 *
 * An absent or empty text yields the floor rather than zero: the caller still
 * has something to show, it just has no length to scale by.
 */
export function typingDelayMs(text?: string | null): number {
  const { BASE_MS, PER_CHAR_MS, MAX_MS } = CONFIG.typingPace;

  const charCount = text?.length ?? 0;

  return Math.min(BASE_MS + charCount * PER_CHAR_MS, MAX_MS);
}
