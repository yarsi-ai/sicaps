/**
 * Locale-keyed registry for every static bot-facing string in Screening Chat V2.
 *
 * These are the strings shown to the user when the LLM is bypassed or fails:
 * fallback templates, farewells, crisis responses, chips copy and error notices.
 * They live in the domain layer rather than next-intl because services and pure
 * domain code must not import Next.js modules.
 *
 * Pure data + pure selectors — no I/O.
 */

import type { ChipsType, DimensionName, RiskLevel } from '../types';

export type Locale = 'id' | 'en';

/** Bot copy for a single locale. */
interface BotTextBundle {
  /** Opening message written when a session is created. */
  greeting: string;
  /** Per-dimension nudge used when compose fails but extraction worked. */
  fallbackByDimension: Record<DimensionName, string>;
  /** Fallback nudge when no specific dimension is pending. */
  fallbackGeneric: string;
  /** Farewell when the hard turn limit closes a session with data missing. */
  hardLimitIncomplete: string;
  /** Farewell when the hard turn limit closes an otherwise complete session. */
  hardLimitComplete: string;
  /** Closing message once screening finishes and the result is ready. */
  screeningComplete: string;
  /** Fallback for the first COLLECTING turn when no symptoms were mentioned. */
  warmup: string;
  /** Fallback when asking how serious the user considers their complaint. */
  perceptionSeverity: string;
  /** Fallback when asking whether anything blocks them from seeking care. */
  perceptionBarrier: string;
  /** Shorter barrier fallback used after an LLM-resolved severity answer. */
  perceptionBarrierShort: string;
  /** Re-ask when the perception answer could not be classified. */
  perceptionClarify: string;
  /** Shown when both extraction and compose fail. */
  technicalError: string;
  /** Generic conflict clarification when the dimension has no template. */
  clarifyGeneric: string;
  /** Natural bot message introducing each chips question. */
  chipsIntro: Record<ChipsType, string[]>;
  /** Option labels for each chips question. */
  chipsLabels: {
    contactYes: string;
    contactNo: string;
    dormYes: string;
    dormNo: string;
    sharingYes: string;
    sharingNo: string;
    other: string;
    bodyParts: Record<string, string>;
  };
  /** Crisis-response copy, keyed by detected severity. */
  crisis: { high: string; low: string };
  /**
   * Mandatory education points per risk level, unnumbered.
   *
   * Single source for both the API result payload and the prompt injected
   * during SCREENING_COMPLETE, so the advice the bot speaks matches the advice
   * the result page shows.
   */
  edukasiByRisk: Record<RiskLevel, string[]>;
}

// ---------------------------------------------------------------------------
// Indonesian
// ---------------------------------------------------------------------------

const ID: BotTextBundle = {
  greeting:
    'Hai! Aku SICAPS, chatbot yang bantu cek masalah kulit kamu. Ceritain aja keluhan yang kamu rasain, nanti aku bantu skrining ya. Santai aja, kayak ngobrol sama teman!',
  fallbackByDimension: {
    intensitas: 'Oke, aku catat ya. Btw, gatalnya itu seberapa ganggu di keseharian kamu?',
    waktu: 'Baik, noted. Nah soal waktunya, kapan biasanya paling kerasa gatalnya?',
    lokasi_tubuh: 'Oke. Terus di bagian tubuh mana aja yang sering gatal atau ada kelainan?',
    kontak: 'Sip. Ada ga sih teman sekamar atau yang deket-deket yang punya keluhan mirip?',
    lesi: 'Oke aku catat. Nah kulitnya sendiri ada perubahan ga? Kayak bentol, bintil, atau luka?',
    faktor_risiko:
      'Baik. Terakhir, soal lingkungan tinggal - sekamar banyakan ga? Suka tukeran handuk?',
  },
  fallbackGeneric: 'Oke, aku catat. Ada lagi yang mau kamu ceritain?',
  hardLimitIncomplete:
    'Makasih ya udah cerita banyak! Sayangnya info yang aku kumpulin belum lengkap buat kasih penilaian risiko. Saran aku, langsung aja periksakan ke kader kesehatan atau dokter di pondokmu biar bisa dicek langsung. Kamu bisa mulai sesi baru kapan aja kalau mau coba lagi.',
  hardLimitComplete:
    'Makasih ya udah ngobrol! Sesi ini udah selesai. Kalau ada keluhan baru atau mau cek ulang, kamu bisa mulai sesi baru kapan aja.',
  screeningComplete:
    'Makasih ya udah cerita! Aku udah selesai analisis hasilnya. Klik tombol di bawah buat lihat hasil skrining kamu.',
  warmup: 'Oke! Langsung aja ya, ada keluhan apa sama kulitmu akhir-akhir ini?',
  perceptionSeverity:
    'Oke, info gejala sudah cukup lengkap. Nah menurut kamu, keluhan gatal ini termasuk (1) biasa aja, (2) cukup mengganggu, atau (3) bikin khawatir banget?',
  perceptionBarrier:
    'Oke noted. Terus ada ga sih hal yang bikin kamu ragu atau males buat periksa ke kader atau dokter? Misal malu, takut, ribet, atau alasan lain? Kalau ga ada juga gapapa.',
  perceptionBarrierShort:
    'Oke noted. Terus ada ga sih hal yang bikin kamu ragu buat periksa ke kader atau dokter? Kalau ga ada juga gapapa.',
  perceptionClarify:
    'Hmm maaf aku kurang nangkep 😅 Coba jawab pakai angka ya: (1) biasa aja, (2) cukup mengganggu, atau (3) bikin khawatir banget?',
  technicalError: 'Maaf, ada gangguan teknis. Kemungkinan kuota API habis. Coba lagi nanti ya.',
  clarifyGeneric: 'Boleh dipastikan lagi jawaban tadi?',
  chipsIntro: {
    kontak: [
      'Oke, soal orang di sekitarmu. Ada ga teman atau orang sekitar yang mengalami kondisi yang sama seperti kamu?',
      'Nah, aku mau tanya. Di sekitar kamu, ada yang punya keluhan serupa ga? Misal teman sekamar atau yang deket-deket?',
      'Btw, ada ga orang lain di sekitar kamu yang juga gatal-gatal kayak gini?',
      'Satu hal lagi, teman kamu ada yang ngalamin gatal serupa ga?',
    ],
    lokasi: [
      'Oke, sekarang aku mau tanya lokasi persisnya. Di bagian tubuh mana aja yang terasa gatal? Boleh pilih lebih dari satu ya.',
      'Nah, gatalnya di mana aja nih? Pilih bagian tubuh yang terasa gatal ya, bisa lebih dari satu.',
      'Sekarang soal lokasi. Di titik mana aja kamu ngerasa gatal? Pilih yang sesuai ya.',
      'Oke noted. Terus gatalnya di area mana aja? Tandain yang sesuai, boleh lebih dari satu.',
    ],
    asrama: [
      'Kamu tinggal bareng teman-teman di pondok atau asrama ga?',
      'Oh ya, kamu tinggal di pondok atau asrama bareng teman-teman bukan?',
      'Btw, kamu tinggal bareng banyak orang di asrama atau pondok ga?',
      'Soal tempat tinggal, kamu di pondok atau asrama bareng teman-teman enggak?',
    ],
    tukar_alat: [
      'Satu lagi soal kebiasaan sehari-hari. Sering tukar-tukaran handuk, baju, atau sarung sama teman?',
      'Terakhir nih, kamu suka pinjem atau tukeran handuk, baju, atau sarung sama teman ga?',
      'Oh ya, soal kebiasaan. Ada ga kebiasaan tuker-tukeran barang pribadi kayak handuk atau baju?',
      'Last question, sering ga tukeran alat pribadi sama teman? Kayak handuk, sarung, atau baju gitu.',
    ],
  },
  chipsLabels: {
    contactYes: 'Ada temanku yang gatal juga',
    contactNo: 'Enggak ada',
    dormYes: 'Iya, di pondok/asrama',
    dormNo: 'Enggak',
    sharingYes: 'Iya sering tukeran',
    sharingNo: 'Enggak pernah',
    other: 'Lainnya',
    bodyParts: {
      'sela jari tangan': 'Sela jari tangan',
      'sela jari kaki': 'Sela jari kaki',
      'pergelangan tangan': 'Pergelangan tangan',
      'pergelangan kaki': 'Pergelangan kaki',
      'alat kelamin': 'Alat kelamin',
      'area pusar': 'Area pusar',
      dada: 'Dada',
      ketiak: 'Ketiak',
      paha: 'Paha',
      siku: 'Siku',
    },
  },
  crisis: {
    high: 'Saya sangat khawatir dengan keadaanmu. Tolong segera hubungi ustadz/ustadzah atau petugas kesehatan di pondokmu. Kamu tidak sendirian.',
    low: 'Aku dengar kamu lagi nggak baik-baik aja. Perasaanmu valid dan kamu nggak sendirian. Kalau butuh cerita atau bantuan, coba bicara sama ustadz/ustadzah atau kader kesehatan di pondokmu ya — mereka bisa bantu.',
  },
  edukasiByRisk: {
    HIGH: [
      'Segera temui kader santri atau dokter untuk pemeriksaan',
      'Kebiasaan tukar alat pribadi (handuk, baju, sarung) jangan diulang lagi',
      'Sprei dicuci sekali seminggu',
      'Kasur dijemur sekali seminggu',
    ],
    MODERATE: [
      'Perlu menjaga kebersihan diri dan kamar',
      'Jangan menukar atau meminjam barang pribadi (handuk, baju, sarung)',
      'Jika dalam 3 hari tidak membaik, temui kader atau dokter',
    ],
    LOW: [
      'Perlu menjaga kebersihan diri dan kamar',
      'Jangan menukar atau meminjam barang pribadi (handuk, baju, sarung)',
    ],
  },
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const EN: BotTextBundle = {
  greeting:
    "Hi! I'm SICAPS, a chatbot that helps check on your skin problems. Just tell me what you're feeling and I'll help screen it. Keep it casual, like chatting with a friend!",
  fallbackByDimension: {
    intensitas: 'Got it, noted. By the way, how much does the itching get in the way of your day?',
    waktu: 'Alright, noted. About the timing — when does the itching usually feel worst?',
    lokasi_tubuh: 'Okay. And which parts of your body itch or look different?',
    kontak: 'Got it. Is anyone close to you — a roommate maybe — dealing with something similar?',
    lesi: 'Noted. What about the skin itself, has it changed? Like bumps, blisters or sores?',
    faktor_risiko:
      'Alright, last one. About where you live — is the room crowded? Do you share towels?',
  },
  fallbackGeneric: "Got it, noted. Anything else you'd like to tell me?",
  hardLimitIncomplete:
    "Thanks for sharing so much! Unfortunately I couldn't gather enough information to give you a risk assessment. My advice is to get checked directly by a health cadre or a doctor at your pondok. You can start a new session anytime if you'd like to try again.",
  hardLimitComplete:
    'Thanks for chatting! This session is done. If something new comes up or you want another check, you can start a new session anytime.',
  screeningComplete:
    'Thanks for sharing! I have finished analysing your answers. Tap the button below to see your screening result.',
  warmup: "Okay, let's get right to it — what's been going on with your skin lately?",
  perceptionSeverity:
    'Okay, I have enough about your symptoms. So how would you describe this itching — (1) no big deal, (2) fairly bothersome, or (3) really worrying?',
  perceptionBarrier:
    'Noted. Is there anything that makes you hesitant about getting checked by a health cadre or doctor? Maybe embarrassment, fear, cost, or it feels like a hassle? "Nothing" is a fine answer too.',
  perceptionBarrierShort:
    'Noted. Is there anything holding you back from getting checked by a health cadre or doctor? "Nothing" is a fine answer too.',
  perceptionClarify:
    "Hmm, sorry, I didn't quite catch that 😅 Try answering with a number: (1) no big deal, (2) fairly bothersome, or (3) really worrying?",
  technicalError:
    'Sorry, there is a technical problem. The API quota may have run out. Please try again later.',
  clarifyGeneric: 'Could you confirm that answer once more?',
  chipsIntro: {
    kontak: [
      'Okay, about the people around you. Is there a friend or someone nearby dealing with the same condition as you?',
      'Let me ask you something. Around you, does anyone have similar complaints? A roommate, or someone close by?',
      'By the way, is anyone else around you itching like this too?',
      'One more thing — do any of your friends have similar itching?',
    ],
    lokasi: [
      'Okay, now about the exact spots. Which parts of your body feel itchy? You can pick more than one.',
      'So where exactly does it itch? Pick the body parts that feel itchy — more than one is fine.',
      'Now about location. Which spots feel itchy? Pick the ones that match.',
      'Noted. And which areas itch? Mark whichever apply, more than one is fine.',
    ],
    asrama: [
      'Do you live together with friends at a pondok or dormitory?',
      'Oh right, you live at a pondok or dormitory with friends, correct?',
      'By the way, do you live with a lot of people in a dormitory or pondok?',
      'About where you live — are you at a pondok or dormitory with friends?',
    ],
    tukar_alat: [
      'One more about daily habits. Do you often share towels, clothes or sarongs with friends?',
      'Last one — do you borrow or swap towels, clothes or sarongs with friends?',
      'Oh, about habits: do you ever share personal items like towels or clothes?',
      'Last question — do you often share personal items with friends? Like towels, sarongs or clothes.',
    ],
  },
  chipsLabels: {
    contactYes: 'A friend of mine is itching too',
    contactNo: 'No one',
    dormYes: 'Yes, at a pondok/dormitory',
    dormNo: 'No',
    sharingYes: 'Yes, often',
    sharingNo: 'Never',
    other: 'Other',
    bodyParts: {
      'sela jari tangan': 'Between fingers',
      'sela jari kaki': 'Between toes',
      'pergelangan tangan': 'Wrist',
      'pergelangan kaki': 'Ankle',
      'alat kelamin': 'Genital area',
      'area pusar': 'Navel area',
      dada: 'Chest',
      ketiak: 'Armpit',
      paha: 'Thigh',
      siku: 'Elbow',
    },
  },
  crisis: {
    high: "I'm really worried about you. Please reach out right away to an ustadz/ustadzah or a health worker at your pondok. You are not alone.",
    low: "I hear that you're not doing okay. Your feelings are valid and you are not alone. If you need to talk or want help, try speaking with an ustadz/ustadzah or a health cadre at your pondok — they can help.",
  },
  edukasiByRisk: {
    HIGH: [
      'See a santri health cadre or a doctor for an examination right away',
      'Stop sharing personal items (towels, clothes, sarongs)',
      'Wash bed sheets once a week',
      'Air out the mattress in the sun once a week',
    ],
    MODERATE: [
      'Keep yourself and your room clean',
      'Do not share or borrow personal items (towels, clothes, sarongs)',
      'If it does not improve within 3 days, see a health cadre or doctor',
    ],
    LOW: [
      'Keep yourself and your room clean',
      'Do not share or borrow personal items (towels, clothes, sarongs)',
    ],
  },
};

const BUNDLES: Record<Locale, BotTextBundle> = { id: ID, en: EN };

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Full bot copy bundle for a locale. */
export function getBotText(locale: Locale): BotTextBundle {
  return BUNDLES[locale] ?? ID;
}

/**
 * Nudge shown when compose fails but extraction succeeded.
 * Targets the first pending dimension, or a generic prompt when none remain.
 */
export function buildFallbackTemplate(dimensiBelum: string[], locale: Locale): string {
  const text = getBotText(locale);
  const target = dimensiBelum[0] as DimensionName | undefined;
  return (target && text.fallbackByDimension[target]) || text.fallbackGeneric;
}

/** Farewell when the session is force-closed at the hard turn limit. */
export function buildHardLimitMessage(dimensiBelum: string[], locale: Locale): string {
  const text = getBotText(locale);
  return dimensiBelum.length > 0 ? text.hardLimitIncomplete : text.hardLimitComplete;
}

/**
 * Pick one of the natural intro messages that precede a chips question.
 * Random so repeated sessions do not read like a script.
 */
export function pickChipsIntro(chipsType: ChipsType, locale: Locale): string {
  const pool = getBotText(locale).chipsIntro[chipsType];
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
}

/** Mandatory education points for a risk level, unnumbered. */
export function getEdukasiPoints(riskLevel: RiskLevel, locale: Locale): string[] {
  return getBotText(locale).edukasiByRisk[riskLevel] ?? [];
}
