/**
 * Scoring engine for Screening Chat V2.
 *
 * Binary algorithm: 3 gejala kunci + 2 faktor tambahan.
 * Pure, deterministic function: no I/O, no side effects.
 */

import type { ScoringState, RiskLevel } from '../types';
import type { Locale } from '../chat/bot-text';

export interface ScoringResult {
  riskLevel: RiskLevel;
  gejalaCount: number;
  faktorCount: number;
  state: ScoringState;
}

/**
 * Calculate risk level from binary scoring state.
 *
 * Algorithm:
 * - Count true values among 3 gejala kunci (gatalMalam, kontakSerupa, lokasiKhas)
 * - >=2 gejala -> HIGH
 * - 1 gejala + (asrama OR tukarAlat) -> MODERATE
 * - 1 gejala + no faktor -> LOW
 * - 0 gejala -> LOW (regardless of faktor)
 *
 * Preconditions: state is well-formed (all fields boolean)
 * Postconditions: returns deterministic RiskLevel
 * Monotonicity: adding a gejala kunci (false->true) never decreases risk
 */
export function calculateRisk(state: ScoringState): ScoringResult {
  const gejalaCount = [state.gatalMalam, state.kontakSerupa, state.lokasiKhas].filter(
    Boolean,
  ).length;
  const faktorCount = [state.asrama, state.tukarAlat].filter(Boolean).length;

  let riskLevel: RiskLevel;
  if (gejalaCount >= 2) {
    riskLevel = 'HIGH';
  } else if (gejalaCount === 1 && faktorCount > 0) {
    riskLevel = 'MODERATE';
  } else {
    riskLevel = 'LOW';
  }

  return { riskLevel, gejalaCount, faktorCount, state };
}

// ---------------------------------------------------------------------------
// Keyword-driven indicator derivation
// ---------------------------------------------------------------------------

/**
 * Indicator keyword sets, per locale.
 *
 * These must be listed per locale rather than matched by substring: extraction
 * emits the vocabulary of the session's language, so an Indonesian-only set
 * silently leaves the indicator false for every English session. `gatalMalam`
 * has no chips fallback, so a missed match there costs a whole gejala kunci.
 *
 * Every entry must exist in the corresponding `prompt-keywords.ts` vocabulary —
 * enforced by a test, since a keyword the extractor never emits is dead weight.
 *
 * Note the waktu vocabulary also carries duration keywords ("lebih 2 minggu",
 * "more than 2 weeks"); those say nothing about nocturnal itch and are
 * deliberately absent here.
 */
const NIGHT_ITCH_TRUE: Record<Locale, ReadonlySet<string>> = {
  // "siang/pagi mendingan" = daytime is better → nights are worse → TRUE.
  id: new Set([
    'malam',
    'tiap malam',
    'makin parah malam',
    'pas mau tidur',
    'kebangun malam',
    'siang/pagi mendingan',
  ]),
  en: new Set([
    'at night',
    'every night',
    'worse at night',
    'when going to bed',
    'wakes me up at night',
    'better during the day',
  ]),
};

/** Keywords that explicitly negate nocturnal itch. */
const NIGHT_ITCH_FALSE: Record<Locale, ReadonlySet<string>> = {
  id: new Set(['cuma siang', 'tidak malam']),
  en: new Set(['only during the day', 'not at night']),
};

/**
 * Risk-factor keywords indicating communal/dormitory living.
 *
 * Kept deliberately narrow to match the previous substring behaviour exactly:
 * "sekamar rame" and "kasur barengan" describe crowding rather than dormitory
 * residence and did not set this factor before, so widening it would change
 * Indonesian scoring — a clinical call, not a translation one.
 */
const ASRAMA_KEYWORDS: Record<Locale, ReadonlySet<string>> = {
  id: new Set(['asrama']),
  en: new Set(['dormitory']),
};

/** Risk-factor keywords indicating shared personal items. */
const TUKAR_ALAT_KEYWORDS: Record<Locale, ReadonlySet<string>> = {
  id: new Set(['tukeran baju', 'tukeran handuk']),
  en: new Set(['sharing clothes', 'sharing towels']),
};

/** Expose the indicator vocabularies so tests can check them for drift. */
export const INDICATOR_KEYWORDS = {
  nightItchTrue: NIGHT_ITCH_TRUE,
  nightItchFalse: NIGHT_ITCH_FALSE,
  asrama: ASRAMA_KEYWORDS,
  tukarAlat: TUKAR_ALAT_KEYWORDS,
} as const;

/** Coverage keywords written when a chips answer fills a dimension. */
export interface ChipsCoverageKeywords {
  kontakYes: string;
  kontakNo: string;
  asramaYes: string;
  tukarAlatYes: string;
}

/**
 * Keywords recorded against a dimension when the user answers via chips.
 *
 * Locale-matched deliberately: these land in `dimensiTerisi` and are later read
 * back by the derivations above, so writing Indonesian keywords into an English
 * session would make a re-score silently drop the risk factors.
 */
const CHIPS_COVERAGE: Record<Locale, ChipsCoverageKeywords> = {
  id: {
    kontakYes: 'teman sekamar',
    kontakNo: 'ga ada yang lain',
    asramaYes: 'asrama',
    tukarAlatYes: 'tukeran handuk',
  },
  en: {
    kontakYes: 'roommate',
    kontakNo: 'no one else',
    asramaYes: 'dormitory',
    tukarAlatYes: 'sharing towels',
  },
};

/** Coverage keywords for chips answers in the given locale. */
export function getChipsCoverageKeywords(locale: Locale = 'id'): ChipsCoverageKeywords {
  return CHIPS_COVERAGE[locale] ?? CHIPS_COVERAGE.id;
}

/** Case-insensitive membership test against an indicator set. */
function matchesAny(keywords: string[], set: ReadonlySet<string>): boolean {
  return keywords.some((k) => set.has(k.toLowerCase().trim()));
}

/**
 * Derive gatalMalam deterministically from waktu dimension keywords.
 *
 * Single source of truth: both gatalMalam and dimensi.waktu derive from
 * the same keyword array — impossible for them to diverge.
 *
 * Logic:
 * - Negasi wins if present (user corrected: "bukan malam, cuma siang")
 * - Any positive keyword → true
 * - No time signal → null (no change)
 *
 * Preconditions: dimensiTerisi contains validated extraction keywords
 * Postconditions: returns boolean | null deterministically
 */
export function deriveGatalMalam(
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>,
  locale: Locale = 'id',
): boolean | null {
  const waktu = dimensiTerisi['waktu'];
  if (!waktu) return null;

  // Negasi wins if there's a conflict (user corrected themselves)
  if (matchesAny(waktu.negasi, NIGHT_ITCH_FALSE[locale])) return false;

  // Any positive keyword → true
  if (matchesAny(waktu.keywords, NIGHT_ITCH_TRUE[locale])) return true;

  // No time-related signal
  return null;
}

/** Derive the asrama risk factor from faktor_risiko keywords. */
export function deriveAsrama(
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>,
  locale: Locale = 'id',
): boolean {
  return matchesAny(dimensiTerisi['faktor_risiko']?.keywords ?? [], ASRAMA_KEYWORDS[locale]);
}

/** Derive the tukarAlat risk factor from faktor_risiko keywords. */
export function deriveTukarAlat(
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>,
  locale: Locale = 'id',
): boolean {
  return matchesAny(dimensiTerisi['faktor_risiko']?.keywords ?? [], TUKAR_ALAT_KEYWORDS[locale]);
}
