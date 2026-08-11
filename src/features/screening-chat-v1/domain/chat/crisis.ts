import type { SupportedLocale } from '../config';
import type { CrisisInstruction } from '../types';

/**
 * Predefined crisis/self-harm indicator keywords per locale.
 * Checked via substring matching on normalized (lowercased, trimmed) input.
 */
const CRISIS_KEYWORDS_ID: readonly string[] = [
  'bunuh diri',
  'mati saja',
  'tidak mau hidup',
  'menyakiti diri',
  'ingin mati',
  'mau mati',
  'akhiri hidup',
  'gantung diri',
] as const;

const CRISIS_KEYWORDS_EN: readonly string[] = [
  'kill myself',
  'want to die',
  'self-harm',
  'end my life',
  'suicide',
  'hurt myself',
  'take my own life',
  'end it all',
] as const;

const CRISIS_KEYWORDS: Record<SupportedLocale, readonly string[]> = {
  id: CRISIS_KEYWORDS_ID,
  en: CRISIS_KEYWORDS_EN,
};

const CRISIS_MESSAGE_ID =
  'Kami mendeteksi pesan yang mengkhawatirkan. Jika kamu membutuhkan bantuan, hubungi 119 (Indonesia) atau 988 (internasional). Kamu tidak sendirian.';

const CRISIS_MESSAGE_EN =
  'We detected a concerning message. If you need help, please contact 119 (Indonesia) or 988 (international). You are not alone.';

/**
 * Rule-based crisis/self-harm keyword detection.
 *
 * Runs synchronously BEFORE any LLM call for safety-critical path.
 * Pure function — no I/O.
 *
 * @param message - Raw user message text
 * @param locale - Session locale ('id' or 'en')
 * @returns CrisisInstruction if crisis keywords detected, null otherwise
 */
export function checkCrisis(message: string, locale: SupportedLocale): CrisisInstruction | null {
  const normalized = message.toLowerCase().trim();

  // Check keywords for both locales — a user may express crisis in either language
  const allKeywords = [...CRISIS_KEYWORDS.id, ...CRISIS_KEYWORDS.en];

  const hasCrisisKeyword = allKeywords.some((keyword) => normalized.includes(keyword));

  if (!hasCrisisKeyword) {
    return null;
  }

  return {
    type: 'CRISIS_HALT',
    helplineNumbers: { id: '119', international: '988' },
    message: locale === 'id' ? CRISIS_MESSAGE_ID : CRISIS_MESSAGE_EN,
    terminateSession: true,
  };
}
