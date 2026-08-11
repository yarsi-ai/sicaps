/**
 * Context-Aware Short Answer Validator (R3)
 *
 * Handles cases where user gives a brief reply (1-3 words) like "ada", "punya", "ya"
 * in response to a bot question about a specific dimension. The LLM extraction often
 * fails on these because "punya"/"ada" aren't in the canonical keyword list.
 *
 * Logic:
 * 1. If dimensiBelum has exactly 1 remaining dimension (clear context), AND
 * 2. User answer is short (≤3 words), AND
 * 3. Answer matches AFFIRMATIVE or NEGATIVE pattern
 * → Fill the dimension with a default keyword (bypassing LLM extraction)
 *
 * Also handles multi-dimension context when the bot's last question clearly
 * targets a specific dimension (detected via dimension-specific question patterns).
 *
 * Pure domain logic — no I/O, no Prisma imports.
 */

import type { DimensionName } from '../types';

// ---------------------------------------------------------------------------
// Word Lists
// ---------------------------------------------------------------------------

/** Affirmative short answers in Indonesian */
const AFFIRMATIVE: string[] = [
  'ya',
  'ada',
  'punya',
  'iya',
  'benar',
  'betul',
  'bener',
  'banyak',
  'iyaa',
  'yaa',
  'yoi',
  'iyaaa',
  'ho oh',
  'ho',
  'heem',
];

/** Negative short answers in Indonesian */
const NEGATIVE: string[] = [
  'tidak',
  'tidak ada',
  'engga',
  'enggak',
  'ga ada',
  'belum',
  'nggak',
  'ga',
  'kagak',
  'ngga',
  'kaga',
  'belom',
  'gak',
  'gak ada',
  'ndak',
];

// ---------------------------------------------------------------------------
// Dimension-Specific Default Keywords
// ---------------------------------------------------------------------------

/**
 * Default keywords to assign when short answer matches affirmative for each dimension.
 * These are canonical keywords from the extraction keyword list.
 */
const AFFIRMATIVE_DEFAULTS: Record<DimensionName, { keywords: string[]; negasi: string[] }> = {
  intensitas: { keywords: ['ganggu tidur'], negasi: [] },
  waktu: { keywords: ['malam'], negasi: [] },
  lokasi_tubuh: { keywords: ['seluruh badan'], negasi: [] },
  kontak: { keywords: ['banyak yang gatal'], negasi: [] },
  lesi: { keywords: ['merah-merah'], negasi: [] },
  faktor_risiko: { keywords: ['asrama'], negasi: [] },
};

/**
 * Default keywords to assign when short answer matches negative for each dimension.
 */
const NEGATIVE_DEFAULTS: Record<DimensionName, { keywords: string[]; negasi: string[] }> = {
  intensitas: { keywords: [], negasi: ['tidak gatal'] },
  waktu: { keywords: [], negasi: ['tidak malam'] },
  lokasi_tubuh: { keywords: [], negasi: [] },
  kontak: { keywords: [], negasi: ['ga ada yang lain'] },
  lesi: { keywords: [], negasi: [] },
  faktor_risiko: { keywords: [], negasi: [] },
};

// ---------------------------------------------------------------------------
// Bot Question → Dimension Patterns
// ---------------------------------------------------------------------------

/**
 * Patterns in bot's last message that indicate which dimension is being asked about.
 * Used when dimensiBelum has more than 1 item (can't rely on single-dimension context).
 */
const QUESTION_DIMENSION_PATTERNS: Record<DimensionName, RegExp[]> = {
  intensitas: [
    /seberapa (parah|gatal)/i,
    /gatalnya (gimana|kayak gimana|separah apa)/i,
    /bisa ditahan/i,
    /ganggu.*tidur/i,
    /susah.*tidur/i,
    /tidur.*ganggu/i,
    /tidur.*susah/i,
    /ga bisa tidur/i,
    /sampai.*tidur/i,
    /bikin.*tidur/i,
  ],
  waktu: [
    /kapan.*gatal/i,
    /malam.*(gatal|parah|lebih|kerasa|terasa)/i,
    /(gatal|parah|kerasa|terasa).*malam/i,
    /waktu.*gatal/i,
    /siang.*malam/i,
    /jam.*gatal/i,
    /pas malam/i,
    /malam hari/i,
    /makin.*(malam|malem)/i,
    /malem/i,
  ],
  lokasi_tubuh: [/di mana.*(gatal|area)/i, /bagian.*tubuh/i, /lokasi/i, /area.*(mana|gatal)/i],
  kontak: [
    /orang.*(sekitar|lain|dekat).*(gatal|serupa|sama)/i,
    /teman.*(gatal|kena|ngalamin)/i,
    /ada.*(yang|orang).*(gatal|kena|serupa)/i,
    /kontak/i,
    /ketularan/i,
    /serupa/i,
  ],
  lesi: [
    /bentol/i,
    /bintik/i,
    /bintil/i,
    /lesi/i,
    /bentuk.*(kulit|kelainan)/i,
    /ada.*bekas/i,
    /lecet/i,
    /merah/i,
    /kulit.*ada/i,
  ],
  faktor_risiko: [/asrama/i, /tukar.*(handuk|baju)/i, /kebersihan/i, /sekamar/i, /lingkungan/i],
};

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface ShortAnswerResult {
  dimension: DimensionName;
  keywords: string[];
  negasi: string[];
  isAffirmative: boolean;
}

/**
 * Validate a short user message and resolve it to a dimension fill.
 *
 * Conditions for activation:
 * 1. Message is short (≤ 3 words)
 * 2. Message matches affirmative OR negative pattern
 * 3. Target dimension can be determined (single remaining or bot question context)
 *
 * Returns null if conditions are not met (should fall through to LLM extraction).
 *
 * Preconditions: dimensiBelum is non-empty, message is sanitized
 * Postconditions: returns dimension fill or null
 */
export function validateShortAnswer(
  message: string,
  dimensiBelum: string[],
  lastBotMessage: string | null,
): ShortAnswerResult | null {
  const normalized = message.toLowerCase().trim();
  const wordCount = normalized.split(/\s+/).length;

  // Condition 1: Must be short (≤3 words)
  if (wordCount > 3) return null;

  // Condition 2: Must match affirmative or negative
  const isAffirmative = matchesWordList(normalized, AFFIRMATIVE);
  const isNegative = matchesWordList(normalized, NEGATIVE);

  if (!isAffirmative && !isNegative) return null;

  // Condition 3: Determine target dimension
  const targetDimension = resolveTargetDimension(dimensiBelum, lastBotMessage);
  if (!targetDimension) return null;

  // Build result
  const defaults = isAffirmative
    ? AFFIRMATIVE_DEFAULTS[targetDimension]
    : NEGATIVE_DEFAULTS[targetDimension];

  // Skip if defaults are empty (no meaningful fill for negation on some dimensions)
  if (defaults.keywords.length === 0 && defaults.negasi.length === 0) return null;

  return {
    dimension: targetDimension,
    keywords: defaults.keywords,
    negasi: defaults.negasi,
    isAffirmative: isAffirmative,
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Check if normalized message matches any word in the list.
 * Matches exact word or word at start followed by space.
 */
function matchesWordList(normalized: string, wordList: string[]): boolean {
  return wordList.some((word) => {
    if (normalized === word) return true;
    if (normalized.startsWith(word + ' ')) return true;
    // Handle multi-word entries (e.g., "tidak ada", "ga ada")
    if (word.includes(' ') && normalized.includes(word)) return true;
    return false;
  });
}

/**
 * Resolve which dimension the short answer is targeting.
 *
 * Strategy:
 * 1. If only 1 dimension remaining → that's the target (high confidence)
 * 2. If bot's last message matches a dimension pattern → that dimension
 * 3. Otherwise → null (can't determine, fall through to LLM)
 */
function resolveTargetDimension(
  dimensiBelum: string[],
  lastBotMessage: string | null,
): DimensionName | null {
  // Strategy 1: Single remaining dimension
  if (dimensiBelum.length === 1) {
    return dimensiBelum[0] as DimensionName;
  }

  // Strategy 2: Bot question pattern matching
  if (lastBotMessage) {
    for (const dim of dimensiBelum) {
      const patterns = QUESTION_DIMENSION_PATTERNS[dim as DimensionName];
      if (patterns && patterns.some((pattern) => pattern.test(lastBotMessage))) {
        return dim as DimensionName;
      }
    }
  }

  return null;
}
