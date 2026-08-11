/**
 * Static bot message pool preceding each chips question.
 *
 * Keyed by locale, then chips type, then tone theme so the same question can be
 * phrased for a playful or a more neutral (hybrid) conversation.
 *
 * Pure data + pure selector — no I/O.
 */

import type { ChipsType, ToneTheme } from '../types';
import type { Locale } from './bot-text';

export interface TemplatePool {
  kontak: { playful: string[]; hybrid: string[] };
  lokasi: { playful: string[]; hybrid: string[] };
  asrama: { playful: string[]; hybrid: string[] };
  tukar_alat: { playful: string[]; hybrid: string[] };
}

const TEMPLATES_ID: TemplatePool = {
  kontak: {
    hybrid: [
      'Satu lagi ya — ada nggak teman dekat atau keluarga yang juga gatal serupa?',
      'Oh iya, kalau boleh tau — ada orang di sekitarmu yang mengalami hal mirip?',
      'Nah ini penting nih — ada nggak yang di dekatmu juga gatal kayak gini?',
    ],
    playful: [
      'Eh eh, satu lagi! Ada nggak temenmu yang gatel juga? 🤔',
      'Nah ini penting banget — ada yang gatel juga di sekitarmu? 👀',
      'Oke oke, terus ada nggak yang gatel bareng kamu? Yuk dijawab! 💬',
    ],
  },
  lokasi: {
    hybrid: [
      'Nah, di bagian tubuh mana aja yang gatal? Pilih yang sesuai ya.',
      'Boleh pilih area mana aja yang terasa gatal — bisa lebih dari satu.',
      'Di mana aja nih gatalnya? Tap yang cocok ya.',
    ],
    playful: [
      'Yuk pilih di mana aja yang gatel! Bisa pilih banyak lho 🫳',
      'Di mana aja nih? Tap yang cocok ya! 👆',
      'Oke sekarang pilih tempat gatelnya — boleh lebih dari satu! ✨',
    ],
  },
  asrama: {
    hybrid: [
      'Soal tempat tinggal ya — apakah kamu tinggal di asrama/kamar bersama?',
      'Sedikit lagi nih — apakah kamu tinggal sekamar dengan orang lain?',
      'Oke satu pertanyaan — soal kondisi tempat tinggalmu ya.',
    ],
    playful: [
      'Soal tempat tinggal ya — gampang kok! 🏠',
      'Satu lagi! Soal kamarmu nih 😊',
      'Oke lanjut — soal tempat tinggal ya! ✨',
    ],
  },
  tukar_alat: {
    hybrid: [
      'Terakhir soal kebiasaan sehari-hari — boleh dijawab.',
      'Satu lagi ya, soal berbagi barang pribadi.',
      'Oke hampir selesai — soal kebiasaan tukar-menukar barang ya.',
    ],
    playful: [
      'Hampir selesai! Soal kebiasaan sehari-hari nih 😊',
      'Sedikit lagi! Soal barang pribadi ya 🎒',
      'Yey terakhir! Jawab soal kebiasaan tukar barang ya! 🎉',
    ],
  },
};

const TEMPLATES_EN: TemplatePool = {
  kontak: {
    hybrid: [
      'One more thing — is there a close friend or family member itching in a similar way?',
      'If you do not mind me asking, is anyone around you dealing with something similar?',
      'This one matters — is anyone near you itching like this too?',
    ],
    playful: [
      'Hey, one more! Any of your friends itching too? 🤔',
      'This one is really important — anyone else around you itching? 👀',
      'Okay okay, so is anyone itching along with you? Go on, answer! 💬',
    ],
  },
  lokasi: {
    hybrid: [
      'So which parts of your body itch? Pick whichever apply.',
      'Feel free to pick the areas that feel itchy — more than one is fine.',
      'Where exactly does it itch? Tap the ones that match.',
    ],
    playful: [
      'Go on, pick where it itches! You can choose several 🫳',
      'Where is it? Tap whichever matches! 👆',
      'Okay, now pick the itchy spots — more than one is fine! ✨',
    ],
  },
  asrama: {
    hybrid: [
      'About where you live — do you stay in a dormitory or a shared room?',
      'Almost there — do you share a room with other people?',
      'Okay, one question — about your living conditions.',
    ],
    playful: [
      'About where you live — easy one! 🏠',
      'One more! About your room 😊',
      'Okay, next up — about where you live! ✨',
    ],
  },
  tukar_alat: {
    hybrid: [
      'Last one, about your daily habits — go ahead and answer.',
      'One more, about sharing personal items.',
      'Okay, almost done — about the habit of swapping items.',
    ],
    playful: [
      'Almost done! About daily habits now 😊',
      'Nearly there! About personal items 🎒',
      'Yay, last one! Answer about swapping items 🎉',
    ],
  },
};

export const BOT_TEMPLATES: Record<Locale, TemplatePool> = {
  id: TEMPLATES_ID,
  en: TEMPLATES_EN,
};

/**
 * Select a random bot template for the given chips type, tone and locale.
 */
export function selectBotTemplate(
  chipsType: ChipsType,
  toneTheme: ToneTheme,
  locale: Locale = 'id',
): string {
  const pool = (BOT_TEMPLATES[locale] ?? TEMPLATES_ID)[chipsType][toneTheme];
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? pool[0] ?? '';
}
