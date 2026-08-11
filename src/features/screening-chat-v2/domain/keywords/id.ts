/**
 * Indonesian (Bahasa Indonesia) keyword tables for scabies screening.
 *
 * Single source of truth for:
 * - Scoring engine (SCORING_TABLE)
 * - Prompt injection (KEYWORD_TABLE with aliases)
 * - Validator filtering (CANONICAL_LIST)
 *
 * Scores: 1 = mild indicator, 2 = moderate indicator, 3 = strong indicator.
 * Negative keywords have penalty scores (subtracted from total).
 */

import type { KeywordEntry, ScoringTable, KeywordTable, CanonicalList } from './types';

// ---------------------------------------------------------------------------
// SCORING_TABLE — Flat lookup: dimension → keyword → score
// ---------------------------------------------------------------------------

export const SCORING_TABLE: ScoringTable = {
  intensitas: {
    'gatal malam hari': 3,
    'gatal parah': 3,
    'gatal tidak tertahankan': 3,
    'gatal sedang': 2,
    'gatal ringan': 1,
    'gatal kadang-kadang': 1,
  },
  waktu: {
    'lebih 2 minggu': 3,
    'lebih 1 bulan': 3,
    '1-2 minggu': 2,
    'kurang 1 minggu': 1,
    'baru kemarin': 1,
  },
  lokasi_tubuh: {
    'sela jari': 3,
    'pergelangan tangan': 2,
    siku: 2,
    'sekitar pusar': 2,
    'alat kelamin': 3,
    bokong: 2,
    ketiak: 2,
    punggung: 1,
    kaki: 1,
  },
  kontak: {
    'teman sekamar gatal': 3,
    'banyak teman gatal': 3,
    'tidur bersama': 2,
    'kontak kulit langsung': 2,
    'keluarga gatal': 2,
    'tidak ada kontak': 1,
  },
  lesi: {
    terowongan: 3,
    'garis tipis bawah kulit': 3,
    'bentol merah': 2,
    'bintik berair': 2,
    'lecet garuk': 1,
    'kulit menebal': 1,
  },
  faktor_risiko: {
    'kamar padat': 3,
    'tidur berdesakan': 3,
    'handuk bersama': 2,
    'baju bersama': 2,
    'jarang mandi': 1,
    'jarang ganti sprei': 1,
  },
  negatif: {
    'sudah sembuh': -1,
    'tidak gatal': -2,
    'sudah diobati': -1,
  },
};

// ---------------------------------------------------------------------------
// KEYWORD_TABLE — Structured with aliases for prompt injection
// ---------------------------------------------------------------------------

export const KEYWORD_TABLE: KeywordTable = {
  intensitas: [
    {
      canonical: 'gatal malam hari',
      aliases: ['gatal waktu tidur', 'garuk malam', 'gatal pas malam'],
      score: 3,
    },
    {
      canonical: 'gatal parah',
      aliases: ['gatal banget', 'gatal sekali', 'sangat gatal'],
      score: 3,
    },
    {
      canonical: 'gatal tidak tertahankan',
      aliases: ['tidak tahan gatal', 'gatal luar biasa'],
      score: 3,
    },
    {
      canonical: 'gatal sedang',
      aliases: ['agak gatal', 'lumayan gatal'],
      score: 2,
    },
    {
      canonical: 'gatal ringan',
      aliases: ['sedikit gatal', 'gatal dikit'],
      score: 1,
    },
    {
      canonical: 'gatal kadang-kadang',
      aliases: ['kadang gatal', 'sesekali gatal'],
      score: 1,
    },
  ],
  waktu: [
    {
      canonical: 'lebih 2 minggu',
      aliases: ['sudah 2 minggu lebih', 'lebih dari dua minggu', 'berminggu-minggu'],
      score: 3,
    },
    {
      canonical: 'lebih 1 bulan',
      aliases: ['sudah sebulan', 'lebih dari sebulan', 'berbulan-bulan'],
      score: 3,
    },
    {
      canonical: '1-2 minggu',
      aliases: ['seminggu lebih', 'sekitar 2 minggu', 'hampir 2 minggu'],
      score: 2,
    },
    {
      canonical: 'kurang 1 minggu',
      aliases: ['beberapa hari', 'belum seminggu', 'baru beberapa hari'],
      score: 1,
    },
    {
      canonical: 'baru kemarin',
      aliases: ['kemarin mulai', 'baru tadi', 'baru saja'],
      score: 1,
    },
  ],
  lokasi_tubuh: [
    {
      canonical: 'sela jari',
      aliases: ['antara jari', 'celah jari', 'di jari-jari'],
      score: 3,
    },
    {
      canonical: 'pergelangan tangan',
      aliases: ['pergelangan', 'tangan bagian dalam'],
      score: 2,
    },
    {
      canonical: 'siku',
      aliases: ['lipatan siku', 'bagian siku'],
      score: 2,
    },
    {
      canonical: 'sekitar pusar',
      aliases: ['pusar', 'daerah pusar', 'perut'],
      score: 2,
    },
    {
      canonical: 'alat kelamin',
      aliases: ['kemaluan', 'area sensitif', 'daerah pribadi'],
      score: 3,
    },
    {
      canonical: 'bokong',
      aliases: ['pantat', 'bagian belakang'],
      score: 2,
    },
    {
      canonical: 'ketiak',
      aliases: ['ketek', 'lipatan ketiak'],
      score: 2,
    },
    {
      canonical: 'punggung',
      aliases: ['bagian punggung', 'belakang badan'],
      score: 1,
    },
    {
      canonical: 'kaki',
      aliases: ['bagian kaki', 'telapak kaki'],
      score: 1,
    },
  ],
  kontak: [
    {
      canonical: 'teman sekamar gatal',
      aliases: ['teman kamar juga gatal', 'sekamar ada yang gatal'],
      score: 3,
    },
    {
      canonical: 'banyak teman gatal',
      aliases: ['banyak yang kena', 'teman-teman gatal', 'satu kamar banyak yang gatal'],
      score: 3,
    },
    {
      canonical: 'tidur bersama',
      aliases: ['satu kasur', 'tidur bareng', 'berbagi tempat tidur'],
      score: 2,
    },
    {
      canonical: 'kontak kulit langsung',
      aliases: ['bersentuhan', 'kontak langsung', 'pegangan tangan'],
      score: 2,
    },
    {
      canonical: 'keluarga gatal',
      aliases: ['di rumah juga gatal', 'keluarga kena', 'adik kakak gatal'],
      score: 2,
    },
    {
      canonical: 'tidak ada kontak',
      aliases: ['sendiri saja', 'tidak ada yang gatal', 'cuma saya'],
      score: 1,
    },
  ],
  lesi: [
    {
      canonical: 'terowongan',
      aliases: ['garis di kulit', 'jalur kecil', 'ada terowongan'],
      score: 3,
    },
    {
      canonical: 'garis tipis bawah kulit',
      aliases: ['garis halus', 'seperti jalur tipis', 'garis putih'],
      score: 3,
    },
    {
      canonical: 'bentol merah',
      aliases: ['bentol-bentol', 'merah-merah', 'bintik merah'],
      score: 2,
    },
    {
      canonical: 'bintik berair',
      aliases: ['ada airnya', 'berisi cairan', 'lepuh kecil'],
      score: 2,
    },
    {
      canonical: 'lecet garuk',
      aliases: ['bekas garukan', 'luka garuk', 'kulit lecet'],
      score: 1,
    },
    {
      canonical: 'kulit menebal',
      aliases: ['kulit kasar', 'kulit keras', 'menebal'],
      score: 1,
    },
  ],
  faktor_risiko: [
    {
      canonical: 'kamar padat',
      aliases: ['kamar penuh', 'kamar sesak', 'terlalu ramai'],
      score: 3,
    },
    {
      canonical: 'tidur berdesakan',
      aliases: ['kasur sempit', 'tidur berdempetan', 'berhimpitan'],
      score: 3,
    },
    {
      canonical: 'handuk bersama',
      aliases: ['berbagi handuk', 'pakai handuk bareng', 'satu handuk'],
      score: 2,
    },
    {
      canonical: 'baju bersama',
      aliases: ['berbagi baju', 'pinjam baju', 'tukar baju'],
      score: 2,
    },
    {
      canonical: 'jarang mandi',
      aliases: ['mandi jarang', 'kadang tidak mandi', 'malas mandi'],
      score: 1,
    },
    {
      canonical: 'jarang ganti sprei',
      aliases: ['sprei jarang diganti', 'sprei kotor', 'tidak ganti sprei'],
      score: 1,
    },
  ],
  negatif: [
    {
      canonical: 'sudah sembuh',
      aliases: ['sudah baikan', 'sudah hilang', 'sudah tidak gatal'],
      score: -1,
    },
    {
      canonical: 'tidak gatal',
      aliases: ['tidak terasa gatal', 'gatalnya hilang', 'sudah tidak ada rasa gatal'],
      score: -2,
    },
    {
      canonical: 'sudah diobati',
      aliases: ['sudah pakai obat', 'sudah minum obat', 'sudah ke dokter'],
      score: -1,
    },
  ],
};

// ---------------------------------------------------------------------------
// CANONICAL_LIST — For validator (just canonical names per dimension)
// ---------------------------------------------------------------------------

export const CANONICAL_LIST: CanonicalList = {
  intensitas: KEYWORD_TABLE.intensitas.map((e: KeywordEntry) => e.canonical),
  waktu: KEYWORD_TABLE.waktu.map((e: KeywordEntry) => e.canonical),
  lokasi_tubuh: KEYWORD_TABLE.lokasi_tubuh.map((e: KeywordEntry) => e.canonical),
  kontak: KEYWORD_TABLE.kontak.map((e: KeywordEntry) => e.canonical),
  lesi: KEYWORD_TABLE.lesi.map((e: KeywordEntry) => e.canonical),
  faktor_risiko: KEYWORD_TABLE.faktor_risiko.map((e: KeywordEntry) => e.canonical),
  negatif: KEYWORD_TABLE.negatif.map((e: KeywordEntry) => e.canonical),
};
