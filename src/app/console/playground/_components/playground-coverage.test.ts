import { describe, it, expect } from 'vitest';
import { updateCoverage } from './playground-coverage';

describe('updateCoverage', () => {
  it('returns category names with non-empty keyword arrays from valid extraction', () => {
    const extraction = {
      intensitas: [{ keyword: 'gatal', confidence: 'high' }],
      waktu: [{ keyword: '2 minggu', confidence: 0.9 }],
      lokasi_tubuh: [],
    };

    const result = updateCoverage([], extraction);

    expect(result).toEqual(['intensitas', 'waktu']);
  });

  it('accumulates without duplicates across turns', () => {
    const newExtraction = {
      waktu: [{ keyword: '1 bulan', confidence: 'high' }],
      lokasi_tubuh: [{ keyword: 'tangan', confidence: 'medium' }],
    };

    const result = updateCoverage(['intensitas'], newExtraction);

    expect(result).toEqual(['intensitas', 'waktu', 'lokasi_tubuh']);
  });

  it('deduplicates when extraction contains already-covered category', () => {
    const extraction = {
      intensitas: [{ keyword: 'sangat gatal', confidence: 'high' }],
      waktu: [{ keyword: '3 hari', confidence: 0.8 }],
    };

    const result = updateCoverage(['intensitas'], extraction);

    expect(result).toEqual(['intensitas', 'waktu']);
  });

  it('returns unchanged coverage when extraction is null', () => {
    const result = updateCoverage(['intensitas'], null);

    expect(result).toEqual(['intensitas']);
  });

  it('returns empty array when current is empty and extraction is null', () => {
    const result = updateCoverage([], null);

    expect(result).toEqual([]);
  });

  it('excludes categories with empty keyword arrays', () => {
    const extraction = {
      intensitas: [],
      waktu: [],
      lokasi_tubuh: [],
    };

    const result = updateCoverage([], extraction);

    expect(result).toEqual([]);
  });

  it('includes only categories with non-empty keyword arrays', () => {
    const extraction = {
      intensitas: [{ keyword: 'gatal', confidence: 'high' }],
      waktu: [],
      lokasi_tubuh: [],
    };

    const result = updateCoverage([], extraction);

    expect(result).toEqual(['intensitas']);
  });
});
