/**
 * Conflict Resolution — LLM extraction vs Chips answer.
 *
 * Detects contradictions between LLM-extracted values and user-submitted chips answers,
 * resolves via one clarification attempt, then defaults to chips as source of truth.
 *
 * Flow per spec §3.6:
 * 1. Detect conflict (LLM extraction contradicts chips)
 * 2. Flag → bot asks clarification ONCE
 * 3. After clarification: if still conflicting → chips wins (explicit user intent)
 *
 * Pure domain logic — no I/O, no Prisma imports.
 */

import { getBotText, type Locale } from './bot-text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictDimension = 'kontak' | 'lokasi' | 'asrama' | 'tukar_alat';

export interface ConflictFlag {
  dimension: ConflictDimension;
  chipsValue: boolean;
  extractedValue: boolean;
}

export interface ConflictState {
  dimension: ConflictDimension;
  extractedValue: boolean;
  chipsValue: boolean;
  clarificationAsked: boolean;
  resolved: boolean;
  finalValue: boolean;
}

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/**
 * Detect if a conflict exists between LLM extraction and chips answer.
 *
 * Conflict = LLM extracted a boolean value AND chips answer contradicts it.
 * Returns null if no conflict (values agree or extraction is null).
 */
export function detectConflict(extractedValue: boolean | null, chipsValue: boolean): boolean {
  if (extractedValue === null) return false;
  return extractedValue !== chipsValue;
}

/**
 * Detect conflict across all relevant dimensions.
 *
 * Compares chips-answered dimensions against subsequent LLM extraction results.
 * Only flags dimensions where chips was ALREADY answered and extraction contradicts.
 *
 * Preconditions: chipsAnswered contains dimensions already answered via chips
 * Postconditions: returns first conflict found, or null if no conflicts
 */
export function detectDimensionConflict(
  chipsAnswered: string[],
  scoringState: { kontakSerupa: boolean; lokasiKhas: boolean; asrama: boolean; tukarAlat: boolean },
  extraction: { kontak?: { keywords: string[]; negasi: string[] } },
): ConflictFlag | null {
  // Check kontak dimension: chips answered, but extraction detects negation
  if (chipsAnswered.includes('kontak')) {
    const kontakExtraction = extraction.kontak;
    if (kontakExtraction) {
      // Chips = "Ya" (kontakSerupa=true) but extraction detects negation
      if (scoringState.kontakSerupa && kontakExtraction.negasi.length > 0) {
        return { dimension: 'kontak', chipsValue: true, extractedValue: false };
      }
      // Chips = "Tidak" (kontakSerupa=false) but extraction detects positive keywords
      if (!scoringState.kontakSerupa && kontakExtraction.keywords.length > 0) {
        return { dimension: 'kontak', chipsValue: false, extractedValue: true };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Conflict Resolution
// ---------------------------------------------------------------------------

/**
 * Create initial conflict state when a conflict is first detected.
 */
export function createConflictState(flag: ConflictFlag): ConflictState {
  return {
    dimension: flag.dimension,
    extractedValue: flag.extractedValue,
    chipsValue: flag.chipsValue,
    clarificationAsked: false,
    resolved: false,
    finalValue: flag.chipsValue, // default: chips wins
  };
}

/**
 * Resolve conflict after clarification attempt.
 *
 * If user provides a clear clarified value → use that.
 * If clarification already asked and still ambiguous → chips wins (spec §3.6).
 */
export function resolveConflict(
  conflict: ConflictState,
  userClarifiedValue: boolean | null,
): ConflictState {
  if (userClarifiedValue !== null) {
    return { ...conflict, resolved: true, finalValue: userClarifiedValue };
  }
  // Unresolved after clarification → chips wins
  return { ...conflict, resolved: true, finalValue: conflict.chipsValue };
}

/**
 * Determine if a conflict should be auto-resolved (chips wins)
 * because clarification was already asked.
 */
export function shouldAutoResolve(conflictClarified: boolean): boolean {
  return conflictClarified;
}

// ---------------------------------------------------------------------------
// Clarification Templates
// ---------------------------------------------------------------------------

/**
 * Conflict clarification templates per dimension.
 *
 * Multiple variations for natural-sounding bot — one is picked randomly at runtime.
 * Tone: casual, non-judgmental, santri-friendly.
 */
const CONFLICT_TEMPLATES: Record<Locale, Record<ConflictDimension, string[]>> = {
  id: {
    kontak: [
      'Tadi kamu sempat cerita soal temen yang gatal juga — jadi sebenernya ada atau nggak yang gatal serupa di sekitarmu?',
      'Hmm, tadi kayaknya ada yang bilang orang dekat juga gatal — bener nggak sih? Boleh konfirmasi.',
      'Sebelumnya kamu bilang ada yang gatal juga — tapi barusan bilang tidak. Yang mana yang bener nih?',
    ],
    lokasi: [
      'Tadi soal lokasi gatalnya agak beda sama yang dipilih — boleh dipastiin lagi area mana aja yang gatal?',
      'Hmm, kayaknya info lokasi gatal tadi agak beda — yang bener di mana aja nih?',
    ],
    asrama: [
      'Tadi soal asrama agak beda infonya — boleh dikonfirmasi lagi?',
      'Info soal asrama tadi sedikit beda — yang bener gimana nih?',
    ],
    tukar_alat: [
      'Tadi soal tuker-tukeran barang agak beda — boleh dipastiin lagi?',
      'Info soal tukar handuk/baju tadi beda — yang bener gimana?',
    ],
  },
  en: {
    kontak: [
      'Earlier you mentioned a friend was itching too — so is there actually someone around you with similar itching, or not?',
      'Hmm, it sounded like someone close to you was itching as well — is that right? Just checking.',
      'Before you said someone else was itching, but just now you said no. Which one is it?',
    ],
    lokasi: [
      'The itch locations you described differ a bit from what you picked — could you confirm which areas itch?',
      'Hmm, the location details seem a little different — which areas is it really?',
    ],
    asrama: [
      'The dormitory details came out a bit differently — could you confirm that?',
      'The information about the dormitory was slightly different — which one is correct?',
    ],
    tukar_alat: [
      'The details about sharing items came out a bit differently — could you confirm?',
      'The information about sharing towels/clothes differed — which one is correct?',
    ],
  },
};

/**
 * Build clarification question for a detected conflict.
 *
 * Returns a randomly selected template for the given dimension.
 * Falls back to generic question if dimension has no templates.
 */
export function buildClarificationQuestion(
  dimension: ConflictDimension | string,
  locale: Locale = 'id',
): string {
  const templates = CONFLICT_TEMPLATES[locale]?.[dimension as ConflictDimension];
  if (!templates || templates.length === 0) {
    return getBotText(locale).clarifyGeneric;
  }
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx]!;
}

/**
 * Check if a user message is a clarification response (affirmative or negative).
 * Used after conflict clarification question to determine user intent.
 *
 * Returns: true = affirms chips contradiction (extraction was right),
 *          false = denies contradiction (chips was right),
 *          null = unclear/ambiguous
 */
export function parseClarificationResponse(
  message: string,
  conflictDimension: ConflictDimension,
  chipsValue: boolean,
): boolean | null {
  const normalized = message.toLowerCase().trim();

  // Both languages are matched regardless of session locale: users mix in
  // "yes"/"no" on Indonesian sessions and vice versa.
  const AFFIRMATIVE = [
    'ya',
    'ada',
    'punya',
    'iya',
    'benar',
    'betul',
    'bener',
    'iya sih',
    'emang',
    'yes',
    'yeah',
    'yep',
    'yup',
    'correct',
    'right',
    'true',
    'there is',
    'there are',
  ];
  const NEGATIVE = [
    'tidak',
    'tidak ada',
    'engga',
    'enggak',
    'ga ada',
    'belum',
    'nggak',
    'ga',
    'kagak',
    'no',
    'nope',
    'nah',
    'none',
    'no one',
    'nobody',
    'not really',
    'incorrect',
    'false',
  ];

  const isAffirmative = AFFIRMATIVE.some((w) => normalized === w || normalized.startsWith(w + ' '));
  const isNegative = NEGATIVE.some((w) => normalized === w || normalized.startsWith(w + ' '));

  if (!isAffirmative && !isNegative) return null;

  // For kontak dimension:
  // If chips said "Ya" (kontakSerupa=true) and extraction said "Tidak":
  //   - User affirms → they agree with extraction → clarified = false (no kontak)
  //   - User denies → they disagree with extraction → clarified = true (has kontak, chips right)
  // If chips said "Tidak" (kontakSerupa=false) and extraction said "Ya":
  //   - User affirms → they agree with extraction → clarified = true (has kontak)
  //   - User denies → they disagree with extraction → clarified = false (no kontak, chips right)
  if (conflictDimension === 'kontak') {
    if (chipsValue === true) {
      // Chips = "Ya" (ada kontak), extraction = "Tidak"
      // Question asks: "jadi ada atau nggak?"
      // Affirmative ("ya", "ada") → user confirms kontak exists → true
      // Negative ("tidak", "ga ada") → user says no kontak → false
      return isAffirmative ? true : false;
    } else {
      // Chips = "Tidak" (ga ada kontak), extraction = "Ya"
      // Question asks: "ada atau nggak?"
      // Affirmative ("ya", "ada") → user says kontak exists → true
      // Negative ("tidak", "ga ada") → user confirms no kontak → false
      return isAffirmative ? true : false;
    }
  }

  // Default: affirmative = true, negative = false
  return isAffirmative ? true : false;
}
