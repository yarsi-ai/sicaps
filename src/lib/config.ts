/**
 * Screening chat version switch — controls whether v1 (scripted) or v2 (LLM conversational) is active.
 * Set via env var; defaults to 'v1' for safe rollout.
 * Requirements: 15.1, 15.3
 */
export const SCREENING_CHAT_VERSION = (process.env.SCREENING_CHAT_VERSION ?? 'v1') as 'v1' | 'v2';

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
    chat: { scope: 'session', maxRequests: 10, windowSeconds: 60 },
    session: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    result: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    pdf: { scope: 'ip', maxRequests: 5, windowSeconds: 60 },
    transcript: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
    health: { scope: 'ip', maxRequests: 30, windowSeconds: 60 },
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
