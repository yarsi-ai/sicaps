import { describe, it, expect } from 'vitest';
import {
  mergeCoverage,
  applyCorrection,
  isCoverageComplete,
  type CoverageState,
  type DimensionExtraction,
  type Correction,
} from './coverage';
import { ALL_DIMENSIONS } from '../types';

// --- Helpers ---

function emptyState(): CoverageState {
  return {
    dimensiTerisi: {},
    dimensiBelum: [...ALL_DIMENSIONS],
  };
}

function partialState(): CoverageState {
  return {
    dimensiTerisi: {
      intensitas: { keywords: ['gatal_parah'], negasi: [] },
      waktu: { keywords: ['malam_hari'], negasi: [] },
    },
    dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
  };
}

// --- mergeCoverage ---

describe('mergeCoverage', () => {
  it('moves dimension from dimensiBelum to dimensiTerisi on first keyword', () => {
    const state = emptyState();
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: ['gatal_ringan'] } },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']).toEqual({
      keywords: ['gatal_ringan'],
      negasi: [],
    });
    expect(result.dimensiBelum).not.toContain('intensitas');
    expect(result.dimensiBelum).toHaveLength(5);
  });

  it('appends keywords to existing dimension without overwriting', () => {
    const state = partialState();
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: ['gatal_sedang'] } },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']?.keywords).toEqual(['gatal_parah', 'gatal_sedang']);
  });

  it('ignores duplicate keywords', () => {
    const state = partialState();
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: ['gatal_parah', 'gatal_sedang'] } },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']?.keywords).toEqual(['gatal_parah', 'gatal_sedang']);
  });

  it('handles negasi same as keywords (append, deduplicate)', () => {
    const state: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_parah'], negasi: ['tidak_gatal'] },
      },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    const extraction: DimensionExtraction = {
      dimensi: {
        intensitas: { keywords: [], negasi: ['tidak_gatal', 'tidak_parah'] },
      },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']?.negasi).toEqual(['tidak_gatal', 'tidak_parah']);
  });

  it('handles multiple dimensions in one extraction', () => {
    const state = emptyState();
    const extraction: DimensionExtraction = {
      dimensi: {
        intensitas: { keywords: ['gatal_parah'] },
        waktu: { keywords: ['malam_hari'] },
        lokasi_tubuh: { keywords: ['sela_jari'] },
      },
    };

    const result = mergeCoverage(state, extraction);

    expect(Object.keys(result.dimensiTerisi)).toHaveLength(3);
    expect(result.dimensiBelum).toHaveLength(3);
    expect(result.dimensiBelum).toEqual(['kontak', 'lesi', 'faktor_risiko']);
  });

  it('skips dimension with empty keywords and no negasi', () => {
    const state = emptyState();
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: [] } },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']).toBeUndefined();
    expect(result.dimensiBelum).toHaveLength(6);
  });

  it('does not mutate input state', () => {
    const state = partialState();
    const original = JSON.parse(JSON.stringify(state));
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: ['gatal_sedang'] } },
    };

    mergeCoverage(state, extraction);

    expect(state).toEqual(original);
  });

  it('handles extraction with empty dimensi record', () => {
    const state = partialState();
    const extraction: DimensionExtraction = { dimensi: {} };

    const result = mergeCoverage(state, extraction);

    expect(result).toEqual(state);
  });

  it('handles negasi without keywords for new dimension', () => {
    const state = emptyState();
    const extraction: DimensionExtraction = {
      dimensi: { intensitas: { keywords: [], negasi: ['tidak_gatal'] } },
    };

    const result = mergeCoverage(state, extraction);

    expect(result.dimensiTerisi['intensitas']).toEqual({
      keywords: [],
      negasi: ['tidak_gatal'],
    });
    expect(result.dimensiBelum).not.toContain('intensitas');
  });
});

// --- applyCorrection ---

describe('applyCorrection', () => {
  it('removes keyword and returns changed=true when valid', () => {
    const state = partialState();
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'gatal_parah',
      keywordPengganti: null,
    };

    const result = applyCorrection(state, correction);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi['intensitas']?.keywords).toEqual([]);
  });

  it('removes keyword and adds replacement', () => {
    const state = partialState();
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'gatal_parah',
      keywordPengganti: 'gatal_ringan',
    };

    const result = applyCorrection(state, correction);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi['intensitas']?.keywords).toEqual(['gatal_ringan']);
  });

  it('returns changed=false when dimension does not exist', () => {
    const state = partialState();
    const correction: Correction = {
      dimensi: 'lesi',
      keywordDibatalkan: 'ruam',
      keywordPengganti: null,
    };

    const result = applyCorrection(state, correction);

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('returns changed=false when keyword does not exist in dimension', () => {
    const state = partialState();
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'nonexistent_keyword',
      keywordPengganti: null,
    };

    const result = applyCorrection(state, correction);

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('does not add duplicate replacement keyword', () => {
    const state: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_parah', 'gatal_ringan'], negasi: [] },
      },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'gatal_parah',
      keywordPengganti: 'gatal_ringan', // already exists
    };

    const result = applyCorrection(state, correction);

    expect(result.changed).toBe(true);
    expect(result.state.dimensiTerisi['intensitas']?.keywords).toEqual(['gatal_ringan']);
  });

  it('does not mutate input state', () => {
    const state = partialState();
    const original = JSON.parse(JSON.stringify(state));
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'gatal_parah',
      keywordPengganti: 'gatal_ringan',
    };

    applyCorrection(state, correction);

    expect(state).toEqual(original);
  });

  it('preserves negasi when applying correction to keywords', () => {
    const state: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_parah'], negasi: ['tidak_gatal'] },
      },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    const correction: Correction = {
      dimensi: 'intensitas',
      keywordDibatalkan: 'gatal_parah',
      keywordPengganti: null,
    };

    const result = applyCorrection(state, correction);

    expect(result.state.dimensiTerisi['intensitas']?.negasi).toEqual(['tidak_gatal']);
  });
});

// --- isCoverageComplete ---

describe('isCoverageComplete', () => {
  it('returns false when dimensiBelum has items', () => {
    const state = partialState();
    expect(isCoverageComplete(state)).toBe(false);
  });

  it('returns true when dimensiBelum is empty', () => {
    const state: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_parah'], negasi: [] },
        waktu: { keywords: ['malam_hari'], negasi: [] },
        lokasi_tubuh: { keywords: ['sela_jari'], negasi: [] },
        kontak: { keywords: ['serumah'], negasi: [] },
        lesi: { keywords: ['papul'], negasi: [] },
        faktor_risiko: { keywords: ['padat'], negasi: [] },
      },
      dimensiBelum: [],
    };
    expect(isCoverageComplete(state)).toBe(true);
  });

  it('returns true for empty dimensiBelum even with empty dimensiTerisi', () => {
    const state: CoverageState = {
      dimensiTerisi: {},
      dimensiBelum: [],
    };
    expect(isCoverageComplete(state)).toBe(true);
  });
});
