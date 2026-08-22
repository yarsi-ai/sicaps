import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { nextPhase, type SessionSnapshot } from './state-machine';
import { ALL_DIMENSIONS, type ChipsType } from '../types';
import { CHIPS_ORDER } from '../config';

/**
 * Property-based tests for state machine phase transitions.
 *
 * **Validates: Requirements 3.2, 3.3**
 */

// --- Arbitraries ---

/**
 * Arbitrary for a valid SessionSnapshot.
 * Generates all combinations of phase, dimensions, perception, flags, and turn counts.
 */
const snapshotArb: fc.Arbitrary<SessionSnapshot> = fc.record({
  phase: fc.constantFrom(
    'GREETING',
    'COLLECTING',
    'AWAITING_IMAGE',
    'ASKING_PERCEPTION',
    'OFFERING_RESULT',
    'SCREENING_COMPLETE',
    'FOLLOW_UP',
    'CLOSED',
  ) as fc.Arbitrary<SessionSnapshot['phase']>,
  dimensiBelum: fc.shuffledSubarray([...ALL_DIMENSIONS], { minLength: 0, maxLength: 6 }),
  perception: fc.option(fc.constantFrom('underestimate', 'overestimate', 'barrier', 'adequate'), {
    nil: null,
  }),
  hasilDitampilkan: fc.boolean(),
  crisisDetected: fc.boolean(),
  turnCount: fc.nat({ max: 50 }),
  partial: fc.boolean(),
  chipsAnswered: fc.subarray(['kontak', 'lokasi', 'asrama', 'tukar_alat'] as ChipsType[]),
  // undefined models snapshots built before the photo gate existed (and v1),
  // which the machine must treat as already resolved.
  imageResolved: fc.option(fc.boolean(), { nil: undefined }),
});

// --- Property 7: Phase Transition Determinism ---

describe('Property 7: Phase Transition Determinism', () => {
  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * For any SessionSnapshot, nextPhase() always returns the same result.
   * The state machine is a pure function — no randomness, no external state.
   */

  it('nextPhase is deterministic — same input always produces same output', () => {
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const result1 = nextPhase(snapshot);
        const result2 = nextPhase(snapshot);
        expect(result1).toBe(result2);
      }),
      { numRuns: 200 },
    );
  });

  it('nextPhase always returns a valid SessionPhase value', () => {
    const validPhases = [
      'GREETING',
      'COLLECTING',
      'AWAITING_IMAGE',
      'ASKING_PERCEPTION',
      'OFFERING_RESULT',
      'SCREENING_COMPLETE',
      'FOLLOW_UP',
      'CLOSED',
    ];
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const result = nextPhase(snapshot);
        expect(validPhases).toContain(result);
      }),
      { numRuns: 200 },
    );
  });

  it('never advances past the photo gate while the image is unresolved', () => {
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const parked: SessionSnapshot = {
          ...snapshot,
          phase: snapshot.phase === 'GREETING' ? 'COLLECTING' : snapshot.phase,
          crisisDetected: false,
          turnCount: 5,
          dimensiBelum: [],
          imageResolved: false,
        };
        expect(nextPhase(parked)).toBe('AWAITING_IMAGE');
      }),
      { numRuns: 200 },
    );
  });

  it('crisis always overrides to CLOSED regardless of other state', () => {
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const withCrisis = { ...snapshot, crisisDetected: true };
        expect(nextPhase(withCrisis)).toBe('CLOSED');
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 8: Chips Completeness Gate ---

describe('Property 8: Chips Completeness Gate', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * If chips-exclusive dimensions are still in dimensiBelum AND chips are incomplete,
   * nextPhase stays in COLLECTING. But if all dimensions are filled (dimensiBelum=[]),
   * chips status doesn't block transition.
   */

  it('chips gate blocks transition only when chips-exclusive dims still in dimensiBelum', () => {
    const incompleteChipsArb = fc.record({
      phase: fc.constant('COLLECTING' as const),
      dimensiBelum: fc.constantFrom(
        ['kontak'],
        ['lokasi_tubuh'],
        ['faktor_risiko'],
        ['kontak', 'lokasi_tubuh'],
      ),
      perception: fc.constant(null),
      hasilDitampilkan: fc.constant(false),
      crisisDetected: fc.constant(false),
      turnCount: fc.integer({ min: 4, max: 24 }),
      partial: fc.boolean(),
      chipsAnswered: fc.subarray([...CHIPS_ORDER], { maxLength: 3 }),
    });

    fc.assert(
      fc.property(incompleteChipsArb, (snapshot) => {
        // When chips-exclusive dims are in dimensiBelum, should stay COLLECTING
        const result = nextPhase(snapshot);
        expect(result).toBe('COLLECTING');
      }),
      { numRuns: 100 },
    );
  });
});
