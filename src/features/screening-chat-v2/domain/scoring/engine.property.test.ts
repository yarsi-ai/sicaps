import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateRisk } from './engine';
import type { ScoringState } from '../types';

/**
 * Property-based tests for the binary scoring engine.
 *
 * Validates: Requirements 1.6, 1.7, 1.2, 1.5
 */

// ---------------------------------------------------------------------------
// Arbitrary: generates all possible ScoringState combinations
// ---------------------------------------------------------------------------

const scoringStateArb = fc.record({
  gatalMalam: fc.boolean(),
  kontakSerupa: fc.boolean(),
  lokasiKhas: fc.boolean(),
  asrama: fc.boolean(),
  tukarAlat: fc.boolean(),
});

// Helper: risk level ordering for monotonicity checks
const RISK_ORDER: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('calculateRisk — property tests', () => {
  /**
   * Property 1: Determinism
   * Same input always produces the same output.
   *
   * Validates: Requirements 1.6
   */
  it('determinism — same input always produces same output', () => {
    fc.assert(
      fc.property(scoringStateArb, (state: ScoringState) => {
        const r1 = calculateRisk(state);
        const r2 = calculateRisk(state);
        expect(r1).toEqual(r2);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: Monotonicity
   * Adding a gejala kunci (false → true) never decreases risk level.
   *
   * Validates: Requirements 1.7
   */
  it('monotonicity — adding gejala kunci never decreases risk', () => {
    fc.assert(
      fc.property(scoringStateArb, (state: ScoringState) => {
        const base = calculateRisk(state);

        const withGatalMalam = calculateRisk({ ...state, gatalMalam: true });
        const withKontakSerupa = calculateRisk({ ...state, kontakSerupa: true });
        const withLokasiKhas = calculateRisk({ ...state, lokasiKhas: true });

        expect(RISK_ORDER[withGatalMalam.riskLevel]).toBeGreaterThanOrEqual(
          RISK_ORDER[base.riskLevel],
        );
        expect(RISK_ORDER[withKontakSerupa.riskLevel]).toBeGreaterThanOrEqual(
          RISK_ORDER[base.riskLevel],
        );
        expect(RISK_ORDER[withLokasiKhas.riskLevel]).toBeGreaterThanOrEqual(
          RISK_ORDER[base.riskLevel],
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Threshold 2/3
   * Any combination with >= 2 gejala kunci always produces HIGH.
   *
   * Validates: Requirements 1.2
   */
  it('threshold 2/3 — any state with >= 2 gejala kunci is always HIGH', () => {
    fc.assert(
      fc.property(scoringStateArb, (state: ScoringState) => {
        const gejalaCount = [state.gatalMalam, state.kontakSerupa, state.lokasiKhas].filter(
          Boolean,
        ).length;
        if (gejalaCount >= 2) {
          expect(calculateRisk(state).riskLevel).toBe('HIGH');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: Faktor irrelevance at 0 and >= 2 gejala
   * When gejala count is 0 or >= 2, faktor values don't change the output.
   *
   * Validates: Requirements 1.2, 1.5
   */
  it('faktor irrelevance — when gejala = 0 or >= 2, faktor values do not change output', () => {
    fc.assert(
      fc.property(scoringStateArb, (state: ScoringState) => {
        const gejalaCount = [state.gatalMalam, state.kontakSerupa, state.lokasiKhas].filter(
          Boolean,
        ).length;
        if (gejalaCount === 0 || gejalaCount >= 2) {
          const withFaktor = calculateRisk({ ...state, asrama: true, tukarAlat: true });
          const withoutFaktor = calculateRisk({ ...state, asrama: false, tukarAlat: false });
          expect(withFaktor.riskLevel).toBe(withoutFaktor.riskLevel);
        }
      }),
      { numRuns: 100 },
    );
  });
});
