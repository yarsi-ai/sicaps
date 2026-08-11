/**
 * Crisis Detection for Screening Chat V2.
 *
 * Detects distress signals in user messages using pattern + keyword matching.
 * Pure function — no I/O, no external dependencies.
 *
 * When crisis is detected, the state machine overrides to CLOSED phase
 * and the user is directed to ustadz/ustadzah or health worker.
 */

import { getBotText, type Locale } from './bot-text';

// --- Types ---

export interface CrisisResult {
  detected: boolean;
  severity: 'low' | 'high';
  response?: string;
}

// --- Constants ---

/**
 * HIGH severity keywords: suicidal ideation, severe self-harm signals.
 * Match triggers immediate escalation.
 */
const HIGH_SEVERITY_KEYWORDS_ID: readonly string[] = [
  'bunuh diri',
  'mau mati',
  'tidak mau hidup',
  'ingin mengakhiri',
  'ingin menyakiti diri',
];

const HIGH_SEVERITY_KEYWORDS_EN: readonly string[] = [
  'kill myself',
  'want to die',
  'end my life',
  'self harm',
  'hurt myself',
];

const HIGH_SEVERITY_KEYWORDS: readonly string[] = [
  ...HIGH_SEVERITY_KEYWORDS_ID,
  ...HIGH_SEVERITY_KEYWORDS_EN,
];

/**
 * LOW severity keywords: moderate distress but not immediate crisis.
 * Match triggers supportive response but not full escalation.
 */
const LOW_SEVERITY_KEYWORDS_ID: readonly string[] = [
  'sangat tertekan',
  'tidak kuat',
  'putus asa',
  'sangat malu',
  'dibully',
  'di-bully',
  'dipermalukan',
  'dikucilkan',
  'dijauhi teman',
  'dipukul',
  'dianiaya',
  'kabur dari rumah',
  'mau lari dari pondok',
  'ga betah di pondok',
  'ga ada yang peduli',
];

const LOW_SEVERITY_KEYWORDS_EN: readonly string[] = [
  'very stressed',
  "can't take it",
  'hopeless',
  'very ashamed',
  'being bullied',
  'being abused',
  'nobody cares',
  'want to run away',
];

const LOW_SEVERITY_KEYWORDS: readonly string[] = [
  ...LOW_SEVERITY_KEYWORDS_ID,
  ...LOW_SEVERITY_KEYWORDS_EN,
];

// --- Main Function ---

/**
 * Check a user message for crisis/distress signals.
 *
 * Detection stays bilingual regardless of the session locale — a user may voice
 * distress in either language — but the response is written in `locale` so the
 * escalation message is one the user can actually read.
 *
 * Logic:
 * 1. Normalize message to lowercase
 * 2. Check HIGH keywords first — if found, return high severity with escalation
 * 3. Check LOW keywords — if found, return low severity with support message
 * 4. If nothing found, return no detection
 */
export function checkCrisis(message: string, locale: Locale = 'id'): CrisisResult {
  const normalized = message.toLowerCase();
  const { crisis } = getBotText(locale);

  for (const keyword of HIGH_SEVERITY_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        detected: true,
        severity: 'high',
        response: crisis.high,
      };
    }
  }

  for (const keyword of LOW_SEVERITY_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        detected: true,
        severity: 'low',
        response: crisis.low,
      };
    }
  }

  return { detected: false, severity: 'low' };
}
