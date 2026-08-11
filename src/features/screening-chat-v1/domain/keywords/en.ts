import type { PatternTable } from './types';

export const PATTERN_TABLE_EN = {
  positive: {
    intensitas: [
      {
        patterns: ['very itchy', 'intense itching', 'itchy', 'severe', 'really bad'],
        score: 1,
      },
      {
        patterns: ["can't stand it", 'unbearable', "can't take it"],
        score: 1,
      },
      {
        patterns: ['keep scratching', 'want to scratch all the time'],
        score: 1,
      },
      {
        patterns: ['disturbs sleep', 'wakes up', "can't sleep"],
        score: 1,
      },
      {
        patterns: ['causes wound', 'bleeding', 'wound from scratching'],
        score: 1,
      },
      {
        patterns: ['stings', 'somewhat itchy', 'slightly itchy', 'just a little', 'mild'],
        score: 0,
      },
    ],
    waktu: [
      {
        patterns: ['night', 'every night'],
        score: 2,
      },
      {
        patterns: ['worse at night'],
        score: 2,
      },
      {
        patterns: ['at bedtime', 'midnight', 'wakes up at night', 'early morning'],
        score: 2,
      },
      {
        patterns: ['better during the day', 'better in the morning'],
        score: 1,
      },
      {
        patterns: ['all day', 'continuously', 'non-stop'],
        score: 1,
      },
    ],
    lokasi_tubuh: [
      {
        patterns: ['between fingers', 'finger webs', 'finger gaps'],
        score: 2,
      },
      {
        patterns: ['genital', 'genitals', 'private parts'],
        score: 2,
      },
      {
        patterns: [
          'fingers',
          'wrist',
          'armpit',
          'navel',
          'stomach',
          'waist',
          'buttocks',
          'groin',
          'inner thigh',
          'chest',
        ],
        score: 1,
      },
      {
        patterns: ['whole body', 'entire body', 'all over'],
        score: 0,
      },
    ],
    kontak: [
      {
        patterns: ['roommate', 'same room', 'sharing a room'],
        score: 2,
      },
      {
        patterns: ['housemate', 'dormitory friend', 'dorm mate'],
        score: 2,
      },
      {
        patterns: ['many are itchy', 'caught it', 'contagious', 'spreading', 'infectious'],
        score: 2,
      },
      {
        patterns: ['same bed', 'same blanket'],
        score: 2,
      },
    ],
    lesi: [
      {
        patterns: ['bumps', 'small bumps', 'papules'],
        score: 2,
      },
      {
        patterns: ['welts', 'hives', 'wheals'],
        score: 1,
      },
      {
        patterns: ['redness', 'red spots', 'rash'],
        score: 1,
      },
      {
        patterns: ['sores', 'wounds', 'scratch marks', 'scabs', 'pus'],
        score: 1,
      },
      {
        patterns: ['lines', 'tracks', 'tunnels', 'burrows'],
        score: 1,
      },
      {
        patterns: ['like bug bites', 'looks like bites'],
        score: 0,
      },
      {
        patterns: ['dry skin', 'cracked skin', 'flaky'],
        score: 0,
      },
    ],
    faktor_risiko: [
      {
        patterns: ['boarding school', 'dormitory', 'dorm'],
        score: 2,
      },
      {
        patterns: ['crowded room', 'many people', 'packed room', 'overcrowded'],
        score: 2,
      },
      {
        patterns: [
          'sharing clothes',
          'borrowing clothes',
          'sharing towel',
          'sharing blanket',
          'borrowing towel',
        ],
        score: 2,
      },
      {
        patterns: ['sharing bed', 'sleeping together', 'same bed'],
        score: 2,
      },
      {
        patterns: ['rarely change sheets', 'poor hygiene', 'rarely wash hands', 'rarely shower'],
        score: 2,
      },
    ],
  },
  negative: {
    intensitas: [
      {
        patterns: ['not itchy', 'no itch', "doesn't itch"],
        score: -2,
      },
    ],
    waktu: [
      {
        patterns: ['only daytime', 'not at night', 'not nighttime'],
        score: -1,
      },
    ],
    kontak: [
      {
        patterns: ['alone', 'no one else', 'only me', 'just me'],
        score: -2,
      },
    ],
    lesi: [
      {
        patterns: ['normal skin', 'no bumps', 'no welts', 'clear skin'],
        score: -2,
      },
    ],
  },
} as const satisfies PatternTable;
