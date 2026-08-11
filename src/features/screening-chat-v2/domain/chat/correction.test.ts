import { describe, it, expect } from 'vitest';

import { applyCorrections } from './correction';
import type { Correction, CoverageState } from './correction';

describe('applyCorrections', () => {
  const baseState: CoverageState = {
    dimensiTerisi: {
      intensitas: { keywords: ['gatal_malam', 'gatal_hebat'], negasi: [] },
      lokasi_tubuh: { keywords: ['sela_jari'], negasi: [] },
    },
    dimensiBelum: ['waktu', 'kontak', 'lesi', 'faktor_risiko'],
  };

  it('removes cancelled keyword and adds replacement', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.keywords).not.toContain('gatal_malam');
    expect(result.state.dimensiTerisi.intensitas.keywords).toContain('gatal_siang');
    expect(result.state.dimensiTerisi.intensitas.keywords).toContain('gatal_hebat');
  });

  it('removes cancelled keyword without adding replacement when keywordPengganti is null', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: null,
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.keywords).not.toContain('gatal_malam');
    expect(result.state.dimensiTerisi.intensitas.keywords).toEqual(['gatal_hebat']);
  });

  it('skips correction when dimension does not exist in dimensiTerisi', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'waktu',
        keywordDibatalkan: 'some_keyword',
        keywordPengganti: 'another_keyword',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(false);
    expect(result.state).toEqual(baseState);
  });

  it('skips correction when keywordDibatalkan is not found in dimension keywords', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'nonexistent_keyword',
        keywordPengganti: 'new_keyword',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(false);
    expect(result.state.dimensiTerisi.intensitas.keywords).toEqual(['gatal_malam', 'gatal_hebat']);
  });

  it('applies multiple corrections independently', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
      {
        dimensi: 'lokasi_tubuh',
        keywordDibatalkan: 'sela_jari',
        keywordPengganti: 'pergelangan',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.keywords).toEqual(['gatal_hebat', 'gatal_siang']);
    expect(result.state.dimensiTerisi.lokasi_tubuh.keywords).toEqual(['pergelangan']);
  });

  it('processes valid corrections even when some are invalid', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'nonexistent_dimension',
        keywordDibatalkan: 'any_keyword',
        keywordPengganti: 'replacement',
      },
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.keywords).toContain('gatal_siang');
    expect(result.state.dimensiTerisi.intensitas.keywords).not.toContain('gatal_malam');
  });

  it('does not add replacement keyword if already present', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_hebat', // already present
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.keywords).toEqual(['gatal_hebat']);
    // gatal_hebat should appear only once
    expect(
      result.state.dimensiTerisi.intensitas.keywords.filter((k) => k === 'gatal_hebat').length,
    ).toBe(1);
  });

  it('does not mutate the input state', () => {
    const originalKeywords = [...baseState.dimensiTerisi.intensitas.keywords];
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
    ];

    applyCorrections(baseState, corrections);

    // Original state must be unchanged
    expect(baseState.dimensiTerisi.intensitas.keywords).toEqual(originalKeywords);
  });

  it('returns changed false for empty corrections array', () => {
    const result = applyCorrections(baseState, []);

    expect(result.changed).toBe(false);
    expect(result.state).toEqual(baseState);
  });

  it('preserves dimensiBelum unchanged', () => {
    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
    ];

    const result = applyCorrections(baseState, corrections);

    expect(result.state.dimensiBelum).toEqual(baseState.dimensiBelum);
  });

  it('preserves negasi array unchanged during keyword correction', () => {
    const stateWithNegasi: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_malam'], negasi: ['tidak_gatal'] },
      },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };

    const corrections: Correction[] = [
      {
        dimensi: 'intensitas',
        keywordDibatalkan: 'gatal_malam',
        keywordPengganti: 'gatal_siang',
      },
    ];

    const result = applyCorrections(stateWithNegasi, corrections);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi.intensitas.negasi).toEqual(['tidak_gatal']);
  });
});
