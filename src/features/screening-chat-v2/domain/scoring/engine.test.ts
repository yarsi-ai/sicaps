import { describe, it, expect } from 'vitest';

import { calculateRisk } from './engine';
import type { ScoringState } from '../types';

/** Helper to create a full ScoringState with defaults (all false) */
function state(overrides: Partial<ScoringState> = {}): ScoringState {
  return {
    gatalMalam: false,
    kontakSerupa: false,
    lokasiKhas: false,
    asrama: false,
    tukarAlat: false,
    ...overrides,
  };
}

describe('calculateRisk', () => {
  describe('HIGH risk (≥2 gejala kunci)', () => {
    it('returns HIGH with gejala=3, faktor=2 when all fields true', () => {
      const input = state({
        gatalMalam: true,
        kontakSerupa: true,
        lokasiKhas: true,
        asrama: true,
        tukarAlat: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(3);
      expect(result.faktorCount).toBe(2);
      expect(result.state).toEqual(input);
    });

    it('returns HIGH with gejala=3, faktor=0 when all gejala true and no faktor', () => {
      const input = state({
        gatalMalam: true,
        kontakSerupa: true,
        lokasiKhas: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(3);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns HIGH with gejala=2 for gatalMalam + kontakSerupa only', () => {
      const input = state({
        gatalMalam: true,
        kontakSerupa: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(2);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns HIGH with gejala=2 for gatalMalam + lokasiKhas only', () => {
      const input = state({
        gatalMalam: true,
        lokasiKhas: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(2);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns HIGH with gejala=2 for kontakSerupa + lokasiKhas only', () => {
      const input = state({
        kontakSerupa: true,
        lokasiKhas: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(2);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns HIGH with gejala=2, faktor=1 when 2 gejala + 1 faktor', () => {
      const input = state({
        gatalMalam: true,
        kontakSerupa: true,
        asrama: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.gejalaCount).toBe(2);
      expect(result.faktorCount).toBe(1);
      expect(result.state).toEqual(input);
    });
  });

  describe('MODERATE risk (1 gejala + ≥1 faktor)', () => {
    it('returns MODERATE with gejala=1, faktor=1 for gatalMalam + asrama', () => {
      const input = state({
        gatalMalam: true,
        asrama: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('MODERATE');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(1);
      expect(result.state).toEqual(input);
    });

    it('returns MODERATE with gejala=1, faktor=1 for kontakSerupa + tukarAlat', () => {
      const input = state({
        kontakSerupa: true,
        tukarAlat: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('MODERATE');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(1);
      expect(result.state).toEqual(input);
    });

    it('returns MODERATE with gejala=1, faktor=2 for lokasiKhas + both faktor', () => {
      const input = state({
        lokasiKhas: true,
        asrama: true,
        tukarAlat: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('MODERATE');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(2);
      expect(result.state).toEqual(input);
    });

    it('returns MODERATE with gejala=1, faktor=2 for gatalMalam + both faktor', () => {
      const input = state({
        gatalMalam: true,
        asrama: true,
        tukarAlat: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('MODERATE');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(2);
      expect(result.state).toEqual(input);
    });
  });

  describe('LOW risk (1 gejala alone or 0 gejala)', () => {
    it('returns LOW with gejala=1, faktor=0 for gatalMalam only', () => {
      const input = state({
        gatalMalam: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('LOW');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns LOW with gejala=1, faktor=0 for kontakSerupa only', () => {
      const input = state({
        kontakSerupa: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('LOW');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns LOW with gejala=1, faktor=0 for lokasiKhas only', () => {
      const input = state({
        lokasiKhas: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('LOW');
      expect(result.gejalaCount).toBe(1);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });

    it('returns LOW with gejala=0, faktor=2 when only faktor present', () => {
      const input = state({
        asrama: true,
        tukarAlat: true,
      });
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('LOW');
      expect(result.gejalaCount).toBe(0);
      expect(result.faktorCount).toBe(2);
      expect(result.state).toEqual(input);
    });

    it('returns LOW with gejala=0, faktor=0 when all fields false', () => {
      const input = state();
      const result = calculateRisk(input);

      expect(result.riskLevel).toBe('LOW');
      expect(result.gejalaCount).toBe(0);
      expect(result.faktorCount).toBe(0);
      expect(result.state).toEqual(input);
    });
  });
});
