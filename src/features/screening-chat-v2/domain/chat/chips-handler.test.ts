import { describe, it, expect } from 'vitest';

import { parseChipsAnswer, validateChipsAnswer, LOKASI_KHAS } from './chips-handler';
import type { ChipsAnswer } from './chips-handler';

describe('parseChipsAnswer', () => {
  describe('kontak (single-select)', () => {
    it('returns kontakSerupa true when selection is Ya', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: ['true'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ kontakSerupa: true });
    });

    it('returns kontakSerupa false when selection is Tidak', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: ['false'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ kontakSerupa: false });
    });
  });

  describe('lokasi (multi-select)', () => {
    it('returns lokasiKhas true when all selections are khas', () => {
      const answer: ChipsAnswer = {
        type: 'lokasi',
        selections: ['sela jari tangan', 'dada'],
      };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({
        lokasiKhas: true,
        lokasiDetail: ['sela jari tangan', 'dada'],
      });
    });

    it('returns lokasiKhas false when only Lainnya with non-khas freeText', () => {
      const answer: ChipsAnswer = {
        type: 'lokasi',
        selections: ['Lainnya'],
        freeText: 'punggung',
      };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({
        lokasiKhas: false,
        lokasiDetail: ['punggung'],
      });
    });

    it('returns lokasiKhas true when mixed khas + Lainnya with non-khas freeText', () => {
      const answer: ChipsAnswer = {
        type: 'lokasi',
        selections: ['sela jari tangan', 'Lainnya'],
        freeText: 'punggung',
      };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({
        lokasiKhas: true,
        lokasiDetail: ['sela jari tangan', 'punggung'],
      });
    });

    it('returns lokasiKhas true when single khas location selected', () => {
      const answer: ChipsAnswer = {
        type: 'lokasi',
        selections: ['ketiak'],
      };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({
        lokasiKhas: true,
        lokasiDetail: ['ketiak'],
      });
    });
  });

  describe('asrama (single-select)', () => {
    it('returns asrama true when selection is Ya', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: ['true'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ asrama: true });
    });

    it('returns asrama false when selection is Tidak', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: ['false'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ asrama: false });
    });
  });

  describe('tukar_alat (single-select)', () => {
    it('returns tukarAlat true when selection is Ya', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: ['true'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ tukarAlat: true });
    });

    it('returns tukarAlat false when selection is Tidak', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: ['false'] };
      const result = parseChipsAnswer(answer);

      expect(result).toEqual({ tukarAlat: false });
    });
  });
});

describe('validateChipsAnswer', () => {
  describe('kontak validation', () => {
    it('rejects empty selections', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: [] };
      expect(validateChipsAnswer(answer)).toBe('Pilih satu jawaban');
    });

    it('rejects invalid selection value', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: ['Mungkin'] };
      expect(validateChipsAnswer(answer)).toBe('Pilihan tidak valid');
    });

    it('accepts valid Ya selection', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: ['true'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });

    it('accepts valid Tidak selection', () => {
      const answer: ChipsAnswer = { type: 'kontak', selections: ['false'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });
  });

  describe('lokasi validation', () => {
    it('rejects when no selections and no freeText', () => {
      const answer: ChipsAnswer = { type: 'lokasi', selections: [] };
      expect(validateChipsAnswer(answer)).toBe('Pilih minimal satu lokasi');
    });

    it('accepts when at least one selection present', () => {
      const answer: ChipsAnswer = { type: 'lokasi', selections: ['dada'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });

    it('accepts when only freeText provided', () => {
      const answer: ChipsAnswer = {
        type: 'lokasi',
        selections: [],
        freeText: 'punggung',
      };
      expect(validateChipsAnswer(answer)).toBeNull();
    });
  });

  describe('asrama validation', () => {
    it('rejects empty selections', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: [] };
      expect(validateChipsAnswer(answer)).toBe('Pilih satu jawaban');
    });

    it('rejects invalid selection value', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: ['Mungkin'] };
      expect(validateChipsAnswer(answer)).toBe('Pilihan tidak valid');
    });

    it('accepts valid Ya selection', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: ['true'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });

    it('accepts valid Tidak selection', () => {
      const answer: ChipsAnswer = { type: 'asrama', selections: ['false'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });
  });

  describe('tukar_alat validation', () => {
    it('rejects empty selections', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: [] };
      expect(validateChipsAnswer(answer)).toBe('Pilih satu jawaban');
    });

    it('rejects invalid selection value', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: ['Mungkin'] };
      expect(validateChipsAnswer(answer)).toBe('Pilihan tidak valid');
    });

    it('accepts valid Ya selection', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: ['true'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });

    it('accepts valid Tidak selection', () => {
      const answer: ChipsAnswer = { type: 'tukar_alat', selections: ['false'] };
      expect(validateChipsAnswer(answer)).toBeNull();
    });
  });
});

describe('LOKASI_KHAS export', () => {
  it('contains exactly 10 canonical locations', () => {
    expect(LOKASI_KHAS).toHaveLength(10);
  });

  it('includes all expected predilection sites', () => {
    const expected = [
      'sela jari tangan',
      'sela jari kaki',
      'alat kelamin',
      'pergelangan tangan',
      'pergelangan kaki',
      'area pusar',
      'dada',
      'ketiak',
      'paha',
      'siku',
    ];
    expect(LOKASI_KHAS).toEqual(expected);
  });
});
