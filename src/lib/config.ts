/**
 * Screening chat version switch — controls whether v1 (scripted) or v2 (LLM conversational) is active.
 * Set via env var; defaults to 'v1' for safe rollout.
 * Requirements: 15.1, 15.3
 */
export const SCREENING_CHAT_VERSION = (process.env.SCREENING_CHAT_VERSION ?? 'v1') as 'v1' | 'v2';

/**
 * TEMPORARY testing switch — moves the mandatory image gate to the *start* of a
 * session instead of the end, so the visual detection flow (consent, action
 * sheet, upload, prediction, gate resolution) can be exercised without walking
 * through the whole collecting phase first.
 *
 * Requirement 1.1 puts the gate at `SCREENING_COMPLETE`, which is where it
 * belongs. To retire this switch: delete this export, the branch in
 * `ChatScreen.tsx`, the branch in `useChat.ts`, the `next.config.ts` env entry,
 * and the `.env` / `.env.example` lines.
 */
export const VISUAL_DETECTION_GATE_AT_START = process.env.VISUAL_DETECTION_GATE_AT_START === 'true';

export const CONFIG = {
  riskThresholds: {
    LOW_MAX: 3,
    MODERATE_MAX: 6,
  },
  sessionLimits: {
    MAX_TURNS: 7,
    MAX_MESSAGES: 14,
    MAX_MESSAGE_LENGTH: 2000,
  },
  scoringCategories: [
    'intensitas',
    'waktu',
    'lokasi_tubuh',
    'kontak',
    'lesi',
    'faktor_risiko',
  ] as const,
  i18n: {
    SUPPORTED_LOCALES: ['id', 'en'] as const,
    DEFAULT_LOCALE: 'id' as const,
  },
  rateLimit: {
    start: { scope: 'ip', maxRequests: 5, windowSeconds: 60 },
    // 30, matching the other session-scoped reads. A screening runs up to
    // TURN_LIMITS.hard (35) turns and chips answers post through this same
    // endpoint one tap at a time, so 10/min was inside normal use — a santri
    // answering briskly hit it, and every failed send spends a slot too.
    chat: { scope: 'session', maxRequests: 30, windowSeconds: 60 },
    session: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    result: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    pdf: { scope: 'ip', maxRequests: 5, windowSeconds: 60 },
    transcript: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    health: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    // Kept below `chat` because each upload runs the vision model server-side.
    // Still well clear of visualDetection.MAX_UPLOAD_FAILURES (3): the gate must
    // never strand a santri whose uploads keep dropping, so the transport budget
    // has to outlast the client's own retry budget several times over.
    image: { scope: 'session', maxRequests: 15, windowSeconds: 60 },
  } as const,
  playground: {
    TIMEOUT_MS: 30_000,
  },
  /** Feature flags for UI elements that can be toggled without code changes. */
  features: {
    /** Show quick reply chips below chat messages. Disable for pure freetext chat. */
    ENABLE_QUICK_REPLY_CHIPS: false,
  },
  /** Polling config for AI result generation on the result page. */
  resultPolling: {
    INTERVAL_MS: 2000,
    MAX_ATTEMPTS: 10,
  },
  /**
   * Pacing for bot turns that skip the LLM and would otherwise land instantly.
   *
   * Read by both the server (static compose branches in `chat.service.ts`) and
   * the client (`useChat` staggering the rows an image submission returns), so
   * the two cannot drift into different rhythms.
   *
   * Set TYPING_ANIMATION=false to skip all delays (useful for testing).
   */
  typingPace: {
    /** Floor, so even a one-word reply reads as someone typing it. */
    BASE_MS: process.env.TYPING_ANIMATION === 'false' ? 0 : 600,
    /** ~400 CPM — fast but readable, similar to WhatsApp/Telegram feel. */
    PER_CHAR_MS: process.env.TYPING_ANIMATION === 'false' ? 0 : 8,
    /** Cap so long messages don't stall the conversation. */
    MAX_MS: 2000,
  },
  /**
   * Determines the source of truth for category coverage.
   * - 'scoring': Scoring engine's `status === 'assessed'` (default, pattern-match based)
   * - 'state_machine': State machine extraction confidence (medium/high from LLM)
   * - 'intersection': Both must agree for a category to be marked covered
   */
  coverageSource: 'scoring' as 'scoring' | 'state_machine' | 'intersection',
  /** Console PIN protection configuration (Requirements 2.4, 4.1) */
  console: {
    SESSION_COOKIE_NAME: 'console_session',
    SESSION_DURATION_HOURS: 24,
    PIN_RATE_LIMIT: {
      maxAttempts: 5,
      windowSeconds: 900, // 15 minutes
    },
  },
  /** Visual detection (image-based scabies detection) configuration (Requirements 4.4, 4.5, 7.1) */
  visualDetection: {
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    ALLOWED_MIME_TYPES: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      'image/bmp',
      'image/tiff',
    ] as const,
    MAX_PREDICTION_ATTEMPTS: 3,
    /**
     * How many transport-level upload failures are allowed before the gate is
     * automatically skipped. Counted client-side on HTTP errors and network
     * drops; server-side prediction retries are a separate concern.
     */
    MAX_UPLOAD_FAILURES: 3,
    /** Validity window for signed URLs handed out for private screening images. */
    SIGNED_URL_TTL_SECONDS: 3600,
  },
} as const;

export type ScoringCategory = (typeof CONFIG.scoringCategories)[number];
export type SupportedLocale = (typeof CONFIG.i18n.SUPPORTED_LOCALES)[number];

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type CoverageSource = typeof CONFIG.coverageSource;

export function getRiskLevel(totalScore: number): RiskLevel {
  if (totalScore <= CONFIG.riskThresholds.LOW_MAX) return 'LOW';
  if (totalScore <= CONFIG.riskThresholds.MODERATE_MAX) return 'MODERATE';
  return 'HIGH';
}
