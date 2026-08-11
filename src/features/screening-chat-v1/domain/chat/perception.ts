import type { SupportedLocale } from '../config';
import { ValidationError } from '@/lib/errors';
import type { Perception } from '../types';

/**
 * Perception indicator phrases per category and locale.
 * Used as reference examples for LLM-based semantic inference.
 */
const INDICATORS_ID: Record<Perception, string[]> = {
  UNDERESTIMATE: [
    'biasa aja',
    'cuma gatal kecil',
    'nggak parah kok',
    'paling nanti sembuh sendiri',
  ],
  OVERESTIMATE: [
    'pasti parah banget',
    'saya mau mati',
    'ini penyakit berbahaya',
    'nggak bisa sembuh lagi',
  ],
  BARRIER: [
    'malu ke dokter',
    'nggak ada uang buat berobat',
    'takut disuntik',
    'nggak ada waktu ke klinik',
  ],
  ADEQUATE: [
    'perlu diperiksa',
    'sebaiknya ke dokter',
    'mau cek ke puskesmas',
    'kayaknya harus ditangani',
  ],
};

const INDICATORS_EN: Record<Perception, string[]> = {
  UNDERESTIMATE: [
    "it's just a small itch",
    "it's nothing serious",
    'probably goes away on its own',
  ],
  OVERESTIMATE: ["I'm going to die", 'this must be really dangerous', "I'll never get better"],
  BARRIER: [
    'no money for doctor',
    "I'm too embarrassed to go to a clinic",
    "I don't have time to see a doctor",
  ],
  ADEQUATE: [
    'I should see a doctor',
    'I think I need to get this checked',
    'I need to go to a clinic',
  ],
};

/**
 * Returns perception indicator phrases for LLM-based semantic inference.
 * Minimum 2 phrases per category for Indonesian locale, minimum 3 for English locale.
 */
export function getPerceptionIndicators(locale: SupportedLocale): Record<Perception, string[]> {
  if (locale === 'en') return INDICATORS_EN;
  if (locale === 'id') return INDICATORS_ID;

  throw new ValidationError(`Invalid locale "${locale as string}" for perception indicators`);
}

/**
 * Framing context strings per perception type and locale.
 * Each perception returns a DISTINCT non-empty string with appropriate framing:
 * - UNDERESTIMATE: corrective (educating about actual risk)
 * - OVERESTIMATE: reassuring (calming fears)
 * - BARRIER: supportive (acknowledging barriers, suggesting solutions)
 * - ADEQUATE: confirmatory (reinforcing correct understanding)
 */
const FRAMING_ID: Record<Perception, string> = {
  UNDERESTIMATE:
    'Pengguna tampak meremehkan kondisinya. Berikan edukasi korektif tentang risiko sebenarnya dari gejala yang dialami, tanpa menakut-nakuti.',
  OVERESTIMATE:
    'Pengguna tampak melebih-lebihkan keparahan kondisinya. Berikan respons yang menenangkan dan jelaskan kondisi sebenarnya berdasarkan gejala yang dilaporkan.',
  BARRIER:
    'Pengguna menghadapi hambatan untuk mendapatkan penanganan. Akui hambatan tersebut dengan empati dan sarankan alternatif solusi yang bisa dijangkau.',
  ADEQUATE:
    'Pengguna memiliki pemahaman yang tepat tentang kondisinya. Konfirmasi pemahaman mereka dan dukung langkah yang sudah direncanakan.',
};

const FRAMING_EN: Record<Perception, string> = {
  UNDERESTIMATE:
    'The user appears to underestimate their condition. Provide corrective education about the actual risk of their symptoms without causing alarm.',
  OVERESTIMATE:
    'The user appears to overestimate the severity of their condition. Provide a reassuring response explaining the actual state based on reported symptoms.',
  BARRIER:
    'The user faces barriers to getting treatment. Acknowledge the barriers with empathy and suggest accessible alternative solutions.',
  ADEQUATE:
    'The user has appropriate understanding of their condition. Confirm their understanding and support the steps they have planned.',
};

/**
 * Returns a distinct non-empty framing string for the given perception and locale.
 * Used to build the persepsi section of the screening output.
 */
export function buildPerceptionInferenceContext(
  perception: Perception,
  locale: SupportedLocale,
): string {
  const framingMap = locale === 'en' ? FRAMING_EN : FRAMING_ID;
  const framing = framingMap[perception];

  if (!framing) {
    throw new ValidationError(`Invalid perception "${perception}" for locale "${locale}"`);
  }

  return framing;
}
