/**
 * English canonical keyword tables for scabies screening.
 *
 * Mirrors the structure of id.ts with English clinical terminology.
 * Single source of truth for scoring, prompt injection, and validation (English locale).
 */

import type { ScoringTable, KeywordTable, CanonicalList } from './types';

// --- Flat scoring lookup (dimension → keyword → score) ---

export const SCORING_TABLE: ScoringTable = {
  intensitas: {
    'nighttime itching': 3,
    'severe itching': 3,
    'unbearable itching': 3,
    'moderate itching': 2,
    'itching disrupts sleep': 2,
    'mild itching': 1,
    'slight itching': 1,
  },
  waktu: {
    'more than 2 weeks': 3,
    'worse at night': 3,
    'itching every night': 3,
    '1 to 2 weeks': 2,
    'getting worse': 2,
    'less than 1 week': 1,
    'just started': 1,
  },
  lokasi_tubuh: {
    'between fingers': 3,
    'genital area': 3,
    wrists: 2,
    armpits: 2,
    waistline: 2,
    'inner thighs': 2,
    back: 1,
    arms: 1,
    'all over body': 1,
  },
  kontak: {
    'roommate has itching': 3,
    'many people itching': 3,
    'spread from others': 3,
    'sleeping together': 2,
    'shared bedding': 2,
    'family member itching': 2,
    'living in dormitory': 1,
  },
  lesi: {
    'burrow marks': 3,
    'tunnel-like lines': 3,
    'small blisters': 2,
    'red bumps': 2,
    'pus-filled bumps': 2,
    'scratch marks': 1,
    rash: 1,
    'dry skin': 1,
  },
  faktor_risiko: {
    'crowded room': 3,
    'shared dormitory': 3,
    'boarding school': 3,
    'shared towels': 2,
    'shared clothing': 2,
    'shared bedding items': 2,
    'poor hygiene': 1,
    'infrequent bathing': 1,
  },
  negatif: {
    'already healed': -1,
    'no itching': -2,
    'already treated': -1,
    'skin is clear': -2,
    'only me affected': -1,
  },
};

// --- Structured keyword table with aliases (for prompt injection) ---

export const KEYWORD_TABLE: KeywordTable = {
  intensitas: [
    {
      canonical: 'nighttime itching',
      aliases: ['itching at night', 'night itch', 'itch at night'],
      score: 3,
    },
    {
      canonical: 'severe itching',
      aliases: ['intense itch', 'really itchy', 'very itchy'],
      score: 3,
    },
    {
      canonical: 'unbearable itching',
      aliases: ['cannot stand the itch', 'itch is unbearable'],
      score: 3,
    },
    { canonical: 'moderate itching', aliases: ['somewhat itchy', 'fairly itchy'], score: 2 },
    {
      canonical: 'itching disrupts sleep',
      aliases: ['cannot sleep due to itch', 'wakes me up'],
      score: 2,
    },
    { canonical: 'mild itching', aliases: ['a little itchy', 'slightly itchy'], score: 1 },
    { canonical: 'slight itching', aliases: ['barely itchy', 'minor itch'], score: 1 },
  ],
  waktu: [
    {
      canonical: 'more than 2 weeks',
      aliases: ['over two weeks', 'several weeks', 'weeks already'],
      score: 3,
    },
    { canonical: 'worse at night', aliases: ['gets worse at night', 'nighttime worse'], score: 3 },
    { canonical: 'itching every night', aliases: ['every night', 'nightly itching'], score: 3 },
    { canonical: '1 to 2 weeks', aliases: ['about a week', 'one to two weeks'], score: 2 },
    { canonical: 'getting worse', aliases: ['worsening', 'progressively worse'], score: 2 },
    { canonical: 'less than 1 week', aliases: ['few days', 'under a week'], score: 1 },
    { canonical: 'just started', aliases: ['recently', 'just began', 'new symptom'], score: 1 },
  ],
  lokasi_tubuh: [
    {
      canonical: 'between fingers',
      aliases: ['finger webs', 'interdigital', 'web spaces'],
      score: 3,
    },
    { canonical: 'genital area', aliases: ['groin', 'private parts', 'genitals'], score: 3 },
    { canonical: 'wrists', aliases: ['wrist area', 'on my wrists'], score: 2 },
    { canonical: 'armpits', aliases: ['underarms', 'axillae'], score: 2 },
    { canonical: 'waistline', aliases: ['belt area', 'around waist', 'abdomen'], score: 2 },
    { canonical: 'inner thighs', aliases: ['thigh area', 'inner leg'], score: 2 },
    { canonical: 'back', aliases: ['on my back', 'upper back'], score: 1 },
    { canonical: 'arms', aliases: ['on my arms', 'forearms'], score: 1 },
    { canonical: 'all over body', aliases: ['everywhere', 'whole body', 'entire body'], score: 1 },
  ],
  kontak: [
    {
      canonical: 'roommate has itching',
      aliases: ['roommate itchy', 'friend in room itchy'],
      score: 3,
    },
    {
      canonical: 'many people itching',
      aliases: ['others are itching too', 'everyone is itchy'],
      score: 3,
    },
    {
      canonical: 'spread from others',
      aliases: ['caught it from someone', 'contagious', 'transmitted'],
      score: 3,
    },
    {
      canonical: 'sleeping together',
      aliases: ['share a bed', 'same bed', 'co-sleeping'],
      score: 2,
    },
    { canonical: 'shared bedding', aliases: ['same blanket', 'shared sheets'], score: 2 },
    { canonical: 'family member itching', aliases: ['sibling itchy', 'parent itchy'], score: 2 },
    {
      canonical: 'living in dormitory',
      aliases: ['dorm', 'boarding house', 'shared housing'],
      score: 1,
    },
  ],
  lesi: [
    {
      canonical: 'burrow marks',
      aliases: ['burrow tracks', 'burrow lines', 'tunnels in skin'],
      score: 3,
    },
    { canonical: 'tunnel-like lines', aliases: ['thin lines', 'track marks on skin'], score: 3 },
    {
      canonical: 'small blisters',
      aliases: ['tiny blisters', 'vesicles', 'fluid bumps'],
      score: 2,
    },
    { canonical: 'red bumps', aliases: ['red spots', 'papules', 'raised red marks'], score: 2 },
    {
      canonical: 'pus-filled bumps',
      aliases: ['pustules', 'infected bumps', 'bumps with pus'],
      score: 2,
    },
    {
      canonical: 'scratch marks',
      aliases: ['excoriations', 'scratched skin', 'scratch wounds'],
      score: 1,
    },
    { canonical: 'rash', aliases: ['skin rash', 'redness'], score: 1 },
    { canonical: 'dry skin', aliases: ['flaky skin', 'peeling skin'], score: 1 },
  ],
  faktor_risiko: [
    {
      canonical: 'crowded room',
      aliases: ['overcrowded', 'packed room', 'many in one room'],
      score: 3,
    },
    { canonical: 'shared dormitory', aliases: ['communal living', 'group housing'], score: 3 },
    {
      canonical: 'boarding school',
      aliases: ['pesantren', 'residential school', 'hostel'],
      score: 3,
    },
    { canonical: 'shared towels', aliases: ['using same towel', 'borrowing towels'], score: 2 },
    {
      canonical: 'shared clothing',
      aliases: ['borrowing clothes', 'using others clothes'],
      score: 2,
    },
    { canonical: 'shared bedding items', aliases: ['shared pillow', 'shared mattress'], score: 2 },
    { canonical: 'poor hygiene', aliases: ['bad hygiene', 'lack of cleanliness'], score: 1 },
    { canonical: 'infrequent bathing', aliases: ['rarely bathe', 'seldom wash'], score: 1 },
  ],
  negatif: [
    { canonical: 'already healed', aliases: ['healed now', 'got better', 'recovered'], score: -1 },
    {
      canonical: 'no itching',
      aliases: ['not itchy', 'no itch at all', 'itch is gone'],
      score: -2,
    },
    {
      canonical: 'already treated',
      aliases: ['received treatment', 'used medicine', 'took medication'],
      score: -1,
    },
    {
      canonical: 'skin is clear',
      aliases: ['no marks', 'skin looks normal', 'clear skin'],
      score: -2,
    },
    { canonical: 'only me affected', aliases: ['no one else has it', 'just me'], score: -1 },
  ],
};

// --- Canonical keyword list per dimension (for validator) ---

export const CANONICAL_LIST: CanonicalList = {
  intensitas: [
    'nighttime itching',
    'severe itching',
    'unbearable itching',
    'moderate itching',
    'itching disrupts sleep',
    'mild itching',
    'slight itching',
  ],
  waktu: [
    'more than 2 weeks',
    'worse at night',
    'itching every night',
    '1 to 2 weeks',
    'getting worse',
    'less than 1 week',
    'just started',
  ],
  lokasi_tubuh: [
    'between fingers',
    'genital area',
    'wrists',
    'armpits',
    'waistline',
    'inner thighs',
    'back',
    'arms',
    'all over body',
  ],
  kontak: [
    'roommate has itching',
    'many people itching',
    'spread from others',
    'sleeping together',
    'shared bedding',
    'family member itching',
    'living in dormitory',
  ],
  lesi: [
    'burrow marks',
    'tunnel-like lines',
    'small blisters',
    'red bumps',
    'pus-filled bumps',
    'scratch marks',
    'rash',
    'dry skin',
  ],
  faktor_risiko: [
    'crowded room',
    'shared dormitory',
    'boarding school',
    'shared towels',
    'shared clothing',
    'shared bedding items',
    'poor hygiene',
    'infrequent bathing',
  ],
  negatif: ['already healed', 'no itching', 'already treated', 'skin is clear', 'only me affected'],
};
