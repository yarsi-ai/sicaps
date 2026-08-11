import type { PatternTable } from './types';

export const PATTERN_TABLE_ID = {
  positive: {
    intensitas: [
      {
        patterns: ['gatal banget', 'gatal hebat', 'gatal', 'parah', 'parah banget'],
        score: 1,
      },
      {
        patterns: ['ga tahan', 'nggak tahan', 'tidak tahan'],
        score: 1,
      },
      {
        patterns: ['pengen garuk terus', 'garuk terus'],
        score: 1,
      },
      {
        patterns: ['ganggu tidur', 'kebangun', 'ga bisa tidur'],
        score: 1,
      },
      {
        patterns: ['sampe luka', 'berdarah', 'luka garuk'],
        score: 1,
      },
      {
        patterns: ['perih', 'lumayan gatal', 'agak gatal', 'dikit doang', 'sedikit'],
        score: 0,
      },
    ],
    waktu: [
      {
        patterns: ['malam', 'tiap malam'],
        score: 2,
      },
      {
        patterns: ['makin parah malam'],
        score: 2,
      },
      {
        patterns: ['pas mau tidur', 'tengah malam', 'kebangun malam', 'subuh'],
        score: 2,
      },
      {
        patterns: ['siang mendingan', 'pagi mendingan'],
        score: 1,
      },
      {
        patterns: ['sepanjang hari', 'terus-terusan', 'terus terusan'],
        score: 1,
      },
    ],
    lokasi_tubuh: [
      {
        patterns: ['sela jari', 'sela sela jari', 'sela-sela jari'],
        score: 2,
      },
      {
        patterns: ['kelamin', 'buah zakar', 'batang kelamin'],
        score: 2,
      },
      {
        patterns: [
          'jari tangan',
          'pergelangan',
          'ketiak',
          'pusar',
          'perut',
          'pinggang',
          'bokong',
          'pantat',
          'selangkangan',
          'paha dalam',
          'dada',
        ],
        score: 1,
      },
      {
        patterns: ['seluruh badan', 'seluruh tubuh', 'semua badan'],
        score: 0,
      },
    ],
    kontak: [
      {
        patterns: ['temen sekamar', 'teman sekamar', 'satu kamar'],
        score: 2,
      },
      {
        patterns: ['serumah', 'temen pondok', 'teman pondok'],
        score: 2,
      },
      {
        patterns: ['banyak yang gatal', 'barengan gatal', 'ketularan', 'nular', 'menular'],
        score: 2,
      },
      {
        patterns: ['satu kasur', 'satu selimut'],
        score: 2,
      },
    ],
    lesi: [
      {
        patterns: ['bintil', 'bintil kecil', 'bintil-bintil'],
        score: 2,
      },
      {
        patterns: ['bentol', 'bentol bentol', 'bentol-bentol'],
        score: 1,
      },
      {
        patterns: ['merah merah', 'merah-merah', 'beruntusan'],
        score: 1,
      },
      {
        patterns: ['lecet', 'luka', 'luka garukan', 'koreng', 'bernanah'],
        score: 1,
      },
      {
        patterns: ['garis', 'jalur', 'terowongan'],
        score: 1,
      },
      {
        patterns: ['kayak digigit', 'seperti digigit'],
        score: 0,
      },
      {
        patterns: ['kulit kering', 'pecah pecah', 'pecah-pecah'],
        score: 0,
      },
    ],
    faktor_risiko: [
      {
        patterns: ['pondok', 'asrama', 'pesantren'],
        score: 2,
      },
      {
        patterns: ['sekamar rame', 'banyak orang', 'desek desekan', 'desak-desakan'],
        score: 2,
      },
      {
        patterns: [
          'tukeran baju',
          'pinjem baju',
          'tukeran sarung',
          'tukeran handuk',
          'pinjam handuk',
        ],
        score: 2,
      },
      {
        patterns: ['kasur barengan', 'tidur bareng', 'satu kasur'],
        score: 2,
      },
      {
        patterns: ['jarang ganti sprei', 'kebersihan kurang', 'jarang cuci tangan', 'jarang mandi'],
        score: 2,
      },
    ],
  },
  negative: {
    intensitas: [
      {
        patterns: ['ga gatal', 'tidak gatal', 'nggak gatal'],
        score: -2,
      },
    ],
    waktu: [
      {
        patterns: ['cuma siang', 'tidak malam', 'bukan malam'],
        score: -1,
      },
    ],
    kontak: [
      {
        patterns: ['sendiri', 'ga ada yang lain', 'tidak ada yang lain', 'cuma saya'],
        score: -2,
      },
    ],
    lesi: [
      {
        patterns: ['kulit normal', 'ga ada bentol', 'tidak ada bentol', 'bersih'],
        score: -2,
      },
    ],
  },
} as const satisfies PatternTable;
