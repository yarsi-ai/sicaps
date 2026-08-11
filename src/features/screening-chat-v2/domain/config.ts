/**
 * Configuration constants for Screening Chat V2.
 *
 * All magic numbers centralized here per coding standards.
 * No process.env access — pure constants only.
 */

/**
 * Turn budget limits.
 * - soft: nudge user toward completion
 * - hard: force close session (set partial=true)
 */
export const TURN_LIMITS = {
  soft: 25,
  hard: 35,
} as const;

/**
 * Optimistic lock time-to-live in seconds.
 * If processingStartedAt exceeds this, the lock is considered stale.
 */
export const LOCK_TTL = 30;

/**
 * Session time-to-live in seconds (24 hours).
 * Sessions older than this cannot be resumed.
 */
export const SESSION_TTL = 24 * 60 * 60;

/** Priority order for sequential chips display */
export const CHIPS_ORDER = ['kontak', 'lokasi', 'asrama', 'tukar_alat'] as const;

/** Canonical lokasi khas list — 10 predilection sites for scabies */
export const LOKASI_KHAS: string[] = [
  'sela jari tangan',
  'sela jari kaki',
  'alat kelamin',
  'pergelangan tangan',
  'pergelangan kaki',
  'area pusar',
  'dada',
  'ketiak',
  'paha',
  'siku',
];

/** Mapping from 6-dimension names to chips types */
export const DIMENSION_TO_CHIPS: Record<string, string> = {
  kontak: 'kontak',
  lokasi_tubuh: 'lokasi',
  faktor_risiko: 'asrama',
};

/**
 * Dimensions that are EXCLUSIVELY filled by chips.
 *
 * For these dimensions:
 * - LLM extraction acts as a SIGNAL (trigger) only — does NOT fill dimensiTerisi
 * - LLM compose is FORBIDDEN from asking about them
 * - Only chips answers can move them from dimensiBelum to dimensiTerisi
 */
export const CHIPS_EXCLUSIVE_DIMENSIONS: string[] = ['kontak', 'lokasi_tubuh', 'faktor_risiko'];

// ---------------------------------------------------------------------------
// Chips UX Timing (R1, R2)
// ---------------------------------------------------------------------------

/**
 * Minimum turn count before first chips can appear.
 * Prevents chips from firing immediately after extraction touches a dimension,
 * giving the conversation a natural warm-up period first.
 *
 * R1: "minimum 3 turn percakapan sebelum chips pertama muncul"
 */
export const CHIPS_MIN_TURN_DELAY = 3;

/**
 * Minimum turn gap between consecutive chips.
 * After a chips is answered, at least this many turns of normal LLM compose
 * must pass before the next chips can trigger.
 *
 * R2: "setelah jawab chips, selalu ada 1 turn LLM compose normal sebelum chips berikutnya"
 */
export const CHIPS_TURN_GAP = 1;

// ---------------------------------------------------------------------------
// Greeting Phase
// ---------------------------------------------------------------------------

/**
 * Maximum turns to stay in GREETING phase for icebreaking.
 * After this many turns, transition to COLLECTING regardless.
 * Can transition earlier if user mentions symptoms (extraction detects something).
 */
export const GREETING_MAX_TURNS = 1;

// ---------------------------------------------------------------------------
// Soft Completion (R5)
// ---------------------------------------------------------------------------

/**
 * Number of consecutive stagnant turns (no new dimension filled) before forcing
 * transition to ASKING_PERCEPTION when only 1 dimension remains.
 *
 * R5: "jika 5 turn stagnasi dan sisa 1 dimensi, force transisi ke ASKING_PERCEPTION"
 */
export const STAGNATION_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Compose truncation guard
// ---------------------------------------------------------------------------

/**
 * `finish_reason` returned when the provider cut the reply at the output-token
 * cap. Such a reply ends mid-word, so it must never reach the user or the DB.
 */
export const FINISH_REASON_TRUNCATED = 'length';

/**
 * Attempts allowed for an LLM call, including the first one. A truncated
 * response is retried once with a wider token budget before falling back.
 *
 * Shared by compose, extraction and result-text generation: all three lose
 * their output to the same shared reasoning budget.
 */
export const LLM_MAX_ATTEMPTS = 2;

/**
 * Multiplier applied to the configured token budget when retrying after a
 * truncated response. Thinking models spend an unpredictable share of the
 * budget on reasoning, so extra headroom is the only lever available at call
 * time.
 */
export const LLM_RETRY_TOKEN_MULTIPLIER = 2;

/**
 * Hard ceiling for the retry token budget, matching the `LLM_MAX_TOKENS_CHAT`
 * upper bound in the env schema.
 */
export const LLM_MAX_TOKENS_CEILING = 4096;

/**
 * Neutral user turn appended when a compose request would otherwise contain
 * only a system message.
 *
 * Gemini's OpenAI-compatible endpoint rejects a system-only message array with
 * `400 GenerateContentRequest.contents: contents is not specified`.
 *
 * Written per locale because it becomes part of the conversation the model
 * sees, and a stray Indonesian turn nudges an English session back to
 * Indonesian.
 */
export const COMPOSE_KICKOFF_MESSAGE: Record<'id' | 'en', string> = {
  id: 'Tulis balasan chat untuk user sekarang.',
  en: 'Write the chat reply for the user now.',
};
