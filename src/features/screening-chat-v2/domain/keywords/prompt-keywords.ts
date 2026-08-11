/**
 * Informal keyword vocabulary injected into the extraction prompt.
 *
 * These are the colloquial forms the LLM is told to emit — distinct from the
 * canonical/alias forms in `id.ts` and `en.ts`, which drive scoring.
 *
 * Single source of truth for two consumers that must never drift apart:
 * - `adapters/llm/prompts.ts` renders this into the extraction prompt's
 *   knowledge base section.
 * - `domain/scoring/validator.ts` accepts these forms when filtering what the
 *   LLM returned. If the prompt offers a keyword the validator rejects, every
 *   extraction using it is silently dropped.
 *
 * Pure data — no I/O.
 */

import type { DimensionName } from '../types';

/**
 * One keyword offered to the LLM.
 *
 * `gloss` and `note` differ in how they render: a glossed keyword gets its own
 * explanatory line, while a noted keyword stays in the inline comma list with a
 * short parenthetical. Self-evident terms need neither.
 */
export interface PromptKeyword {
  keyword: string;
  /** Explanation rendered on its own line after the keyword. */
  gloss?: string;
  /** Short parenthetical kept inline with the keyword. */
  note?: string;
}

/** A dimension's prompt vocabulary, including its section heading text. */
export interface PromptDimension {
  /** Section heading, e.g. `Intensitas`. */
  heading: string;
  /** Short description of what the dimension captures. Omit to render bare. */
  description?: string;
  keywords: PromptKeyword[];
}

export type PromptKeywordTable = Record<DimensionName | 'negatif', PromptDimension>;

// ---------------------------------------------------------------------------
// Indonesian
// ---------------------------------------------------------------------------

export const PROMPT_KEYWORDS_ID: PromptKeywordTable = {
  intensitas: {
    heading: 'Intensitas',
    description: 'seberapa parah gatal',
    keywords: [
      { keyword: 'parah', gloss: 'sangat mengganggu, tidak tertahankan, sampai luka' },
      { keyword: 'ga tahan', gloss: 'ingin garuk terus, tidak bisa menahan' },
      { keyword: 'ganggu tidur', gloss: 'gatal mengganggu tidur/istirahat' },
      { keyword: 'ga bisa tidur', gloss: 'sama sekali tidak bisa tidur karena gatal' },
      { keyword: 'pengen garuk terus', gloss: 'dorongan garuk kuat dan terus-menerus' },
      { keyword: 'lumayan gatal', gloss: 'cukup terasa tapi masih bisa ditahan' },
      { keyword: 'agak gatal', gloss: 'ringan, kadang-kadang saja' },
    ],
  },
  waktu: {
    heading: 'Waktu',
    description: 'kapan gatal muncul/memburuk',
    keywords: [
      { keyword: 'malam', gloss: 'gatal di malam hari' },
      { keyword: 'tiap malam', gloss: 'rutin setiap malam' },
      { keyword: 'makin parah malam', gloss: 'semakin intens saat malam' },
      { keyword: 'pas mau tidur', gloss: 'muncul menjelang tidur' },
      {
        keyword: 'kebangun malam',
        gloss:
          'terbangun karena gatal, termasuk variasi "sampe kebangun", "kebangun subuh", "gatal pas subuh"',
      },
      {
        keyword: 'siang/pagi mendingan',
        gloss: 'siang/pagi lebih baik dibanding malam (artinya malam lebih parah)',
      },
    ],
  },
  lokasi_tubuh: {
    heading: 'Lokasi Tubuh',
    keywords: [
      { keyword: 'sela jari' },
      { keyword: 'jari tangan' },
      { keyword: 'pergelangan' },
      { keyword: 'ketiak' },
      { keyword: 'pusar' },
      { keyword: 'selangkangan' },
      { keyword: 'kelamin' },
      { keyword: 'bokong' },
      { keyword: 'dada' },
      { keyword: 'perut' },
      { keyword: 'pinggang' },
      { keyword: 'paha dalam' },
      { keyword: 'kaki' },
      { keyword: 'seluruh badan', note: 'lihat rule #7' },
    ],
  },
  kontak: {
    heading: 'Kontak',
    keywords: [
      { keyword: 'teman sekamar' },
      { keyword: 'satu kamar' },
      { keyword: 'banyak yang gatal' },
      { keyword: 'ketularan' },
      { keyword: 'satu kasur' },
    ],
  },
  lesi: {
    heading: 'Lesi',
    keywords: [
      { keyword: 'bentol' },
      { keyword: 'merah-merah' },
      { keyword: 'bintil' },
      { keyword: 'kulit kering' },
      { keyword: 'lecet', gloss: 'bekas garukan, belum berkerak' },
      { keyword: 'luka garukan', gloss: 'luka akibat digaruk' },
      { keyword: 'koreng', gloss: 'luka mengering/berkerak' },
      { keyword: 'garis', gloss: 'jalur tipis di kulit (terowongan tungau — bukan garis biasa)' },
    ],
  },
  faktor_risiko: {
    heading: 'Faktor Risiko',
    keywords: [
      { keyword: 'asrama' },
      { keyword: 'sekamar rame' },
      { keyword: 'tukeran baju' },
      { keyword: 'tukeran handuk' },
      { keyword: 'kasur barengan' },
      { keyword: 'jarang ganti sprei' },
      { keyword: 'kebersihan kurang' },
    ],
  },
  negatif: {
    heading: 'Negatif',
    description: 'penyangkalan',
    keywords: [
      { keyword: 'tidak gatal' },
      { keyword: 'ga gatal' },
      { keyword: 'cuma siang' },
      { keyword: 'tidak malam' },
      { keyword: 'ga ada yang lain' },
    ],
  },
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

export const PROMPT_KEYWORDS_EN: PromptKeywordTable = {
  intensitas: {
    heading: 'Intensity',
    description: 'how severe the itching is',
    keywords: [
      { keyword: 'severe', gloss: 'very disruptive, unbearable, scratched until sore' },
      { keyword: "can't stand it", gloss: 'constant urge to scratch, cannot hold back' },
      { keyword: 'disrupts sleep', gloss: 'itching interferes with sleep/rest' },
      { keyword: "can't sleep", gloss: 'cannot sleep at all because of the itching' },
      { keyword: 'keep scratching', gloss: 'strong, continuous urge to scratch' },
      { keyword: 'fairly itchy', gloss: 'noticeable but still bearable' },
      { keyword: 'slightly itchy', gloss: 'mild, only now and then' },
    ],
  },
  waktu: {
    heading: 'Timing',
    description: 'when the itching appears/worsens',
    keywords: [
      { keyword: 'at night', gloss: 'itching during the night' },
      { keyword: 'every night', gloss: 'happens every single night' },
      { keyword: 'worse at night', gloss: 'gets more intense at night' },
      { keyword: 'when going to bed', gloss: 'starts around bedtime' },
      {
        keyword: 'wakes me up at night',
        gloss:
          'woken by the itching, including variants like "woke up scratching", "itchy before dawn"',
      },
      {
        keyword: 'better during the day',
        gloss: 'daytime/morning is milder than night (meaning nights are worse)',
      },
    ],
  },
  lokasi_tubuh: {
    heading: 'Body Location',
    keywords: [
      { keyword: 'between fingers' },
      { keyword: 'fingers' },
      { keyword: 'wrist' },
      { keyword: 'armpit' },
      { keyword: 'navel' },
      { keyword: 'groin' },
      { keyword: 'genitals' },
      { keyword: 'buttocks' },
      { keyword: 'chest' },
      { keyword: 'stomach' },
      { keyword: 'waist' },
      { keyword: 'inner thigh' },
      { keyword: 'feet' },
      { keyword: 'all over body', note: 'see rule #7' },
    ],
  },
  kontak: {
    heading: 'Contact',
    keywords: [
      { keyword: 'roommate' },
      { keyword: 'same room' },
      { keyword: 'many people itching' },
      { keyword: 'caught it from someone' },
      { keyword: 'same bed' },
    ],
  },
  lesi: {
    heading: 'Skin Lesions',
    keywords: [
      { keyword: 'bumps' },
      { keyword: 'red spots' },
      { keyword: 'blisters' },
      { keyword: 'dry skin' },
      { keyword: 'scratch marks', gloss: 'scratch traces, not yet crusted' },
      { keyword: 'scabs', gloss: 'dried/crusted sores' },
      {
        keyword: 'lines',
        gloss: 'thin tracks on the skin (mite burrows — not ordinary lines)',
      },
    ],
  },
  faktor_risiko: {
    heading: 'Risk Factors',
    keywords: [
      { keyword: 'dormitory' },
      { keyword: 'crowded room' },
      { keyword: 'sharing clothes' },
      { keyword: 'sharing towels' },
      { keyword: 'sharing mattress' },
      { keyword: 'rarely change sheets' },
      { keyword: 'poor hygiene' },
    ],
  },
  negatif: {
    heading: 'Negative',
    description: 'denial',
    keywords: [
      { keyword: 'no itching' },
      { keyword: 'not itchy' },
      { keyword: 'only during the day' },
      { keyword: 'not at night' },
      { keyword: 'no one else' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Prompt vocabulary for the given locale. */
export function getPromptKeywordTable(locale: 'id' | 'en'): PromptKeywordTable {
  return locale === 'id' ? PROMPT_KEYWORDS_ID : PROMPT_KEYWORDS_EN;
}

/**
 * Flat `dimension -> keyword[]` view for validator filtering.
 *
 * Derived from the same table the prompt renders, so a keyword offered to the
 * LLM is always one the validator will accept.
 */
export function getPromptKeywordList(locale: 'id' | 'en'): Record<string, string[]> {
  const table = getPromptKeywordTable(locale);
  const result: Record<string, string[]> = {};

  for (const [dimension, section] of Object.entries(table)) {
    result[dimension] = section.keywords.map((k) => k.keyword);
  }

  return result;
}
