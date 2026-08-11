import { describe, it, expect } from 'vitest';
import { buildSummary, type ScoringResult, type CoverageState } from './checkpoint';

describe('buildSummary', () => {
  const baseScoringResult: ScoringResult = {
    total: 8,
    riskLevel: 'HIGH',
    perDimension: {
      intensitas: 3,
      waktu: 2,
      lokasi_tubuh: 1,
      kontak: 2,
    },
    penalty: 0,
  };

  const baseCoverageState: CoverageState = {
    dimensiTerisi: {
      intensitas: { keywords: ['gatal_parah', 'garuk_terus'], negasi: [] },
      waktu: { keywords: ['malam_hari'], negasi: [] },
      lokasi_tubuh: { keywords: ['sela_jari'], negasi: [] },
      kontak: { keywords: ['teman_sekamar'], negasi: ['tidak_kontak'] },
    },
    dimensiBelum: ['lesi', 'faktor_risiko'],
  };

  it('copies totalScore from scoring result', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', null);

    expect(summary.totalScore).toBe(8);
  });

  it('copies riskLevel from scoring result', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', null);

    expect(summary.riskLevel).toBe('HIGH');
  });

  it('copies perception as provided', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'underestimate', null);

    expect(summary.perception).toBe('underestimate');
  });

  it('copies emosi as provided when not null', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', 'takut');

    expect(summary.emosi).toBe('takut');
  });

  it('copies emosi as null when not provided', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', null);

    expect(summary.emosi).toBeNull();
  });

  it('combines coverage keywords with scoring per-dimension scores', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', null);

    expect(summary.perDimension).toEqual({
      intensitas: { keywords: ['gatal_parah', 'garuk_terus'], score: 3 },
      waktu: { keywords: ['malam_hari'], score: 2 },
      lokasi_tubuh: { keywords: ['sela_jari'], score: 1 },
      kontak: { keywords: ['teman_sekamar'], score: 2 },
    });
  });

  it('defaults score to 0 when dimension is in coverage but not in scoring', () => {
    const coverageWithExtra: CoverageState = {
      dimensiTerisi: {
        intensitas: { keywords: ['gatal_parah'], negasi: [] },
        lesi: { keywords: ['keropeng'], negasi: [] },
      },
      dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'faktor_risiko'],
    };

    const scoringWithoutLesi: ScoringResult = {
      total: 3,
      riskLevel: 'LOW',
      perDimension: { intensitas: 3 },
      penalty: 0,
    };

    const summary = buildSummary(scoringWithoutLesi, coverageWithExtra, 'adequate', null);

    expect(summary.perDimension.lesi).toEqual({ keywords: ['keropeng'], score: 0 });
  });

  it('returns empty perDimension when no dimensions are filled', () => {
    const emptyCoverage: CoverageState = {
      dimensiTerisi: {},
      dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };

    const emptyScoring: ScoringResult = {
      total: 0,
      riskLevel: 'LOW',
      perDimension: {},
      penalty: 0,
    };

    const summary = buildSummary(emptyScoring, emptyCoverage, 'barrier', 'netral');

    expect(summary.perDimension).toEqual({});
    expect(summary.totalScore).toBe(0);
    expect(summary.riskLevel).toBe('LOW');
    expect(summary.perception).toBe('barrier');
    expect(summary.emosi).toBe('netral');
  });

  it('does not include negasi in perDimension keywords', () => {
    const summary = buildSummary(baseScoringResult, baseCoverageState, 'adequate', null);

    // The kontak dimension has negasi, but perDimension.keywords should only contain keywords
    expect(summary.perDimension.kontak.keywords).toEqual(['teman_sekamar']);
  });
});
