import { describe, it, expect } from 'vitest';
import { nextPhase, shouldNudge, isTerminal, SessionSnapshot } from './state-machine';

/**
 * Helper to build a base snapshot with sensible defaults.
 * Override specific fields per test.
 */
function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    phase: 'COLLECTING',
    dimensiBelum: [],
    perception: 'adequate',
    hasilDitampilkan: true,
    crisisDetected: false,
    turnCount: 5,
    partial: false,
    chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
    ...overrides,
  };
}

describe('nextPhase', () => {
  it('returns CLOSED when crisis is detected regardless of other state', () => {
    const snapshot = makeSnapshot({
      crisisDetected: true,
      dimensiBelum: ['intensitas', 'waktu'],
      perception: null,
    });
    expect(nextPhase(snapshot)).toBe('CLOSED');
  });

  it('returns CLOSED when turnCount reaches hard limit (35)', () => {
    const snapshot = makeSnapshot({
      turnCount: 35,
      dimensiBelum: ['intensitas'],
    });
    expect(nextPhase(snapshot)).toBe('CLOSED');
  });

  it('returns CLOSED when turnCount exceeds hard limit', () => {
    const snapshot = makeSnapshot({ turnCount: 40 });
    expect(nextPhase(snapshot)).toBe('CLOSED');
  });

  it('returns COLLECTING when there are unfilled dimensions', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: ['intensitas', 'waktu'],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('COLLECTING');
  });

  it('returns ASKING_PERCEPTION when all dimensions filled but perception is null', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('ASKING_PERCEPTION');
  });

  it('returns SCREENING_COMPLETE when perception exists but result not shown', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      perception: 'adequate',
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('SCREENING_COMPLETE');
  });

  it('returns FOLLOW_UP when all conditions met (dimensions filled, perception set, result shown)', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      perception: 'overestimate',
      hasilDitampilkan: true,
    });
    expect(nextPhase(snapshot)).toBe('FOLLOW_UP');
  });

  it('crisis override takes priority over hard limit', () => {
    const snapshot = makeSnapshot({
      crisisDetected: true,
      turnCount: 35,
    });
    expect(nextPhase(snapshot)).toBe('CLOSED');
  });

  it('hard limit takes priority over COLLECTING', () => {
    const snapshot = makeSnapshot({
      turnCount: 35,
      dimensiBelum: ['lokasi_tubuh'],
      crisisDetected: false,
    });
    expect(nextPhase(snapshot)).toBe('CLOSED');
  });

  it('COLLECTING takes priority over ASKING_PERCEPTION', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: ['lesi'],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('COLLECTING');
  });

  it('proceeds to ASKING_PERCEPTION when dimensions complete even if chips incomplete', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      chipsAnswered: ['kontak'],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('ASKING_PERCEPTION');
  });

  it('proceeds to ASKING_PERCEPTION when dimensions complete even if no chips answered', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      chipsAnswered: [],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('ASKING_PERCEPTION');
  });

  it('returns ASKING_PERCEPTION only when both dimensions and chips are complete', () => {
    const snapshot = makeSnapshot({
      dimensiBelum: [],
      chipsAnswered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
      perception: null,
      hasilDitampilkan: false,
    });
    expect(nextPhase(snapshot)).toBe('ASKING_PERCEPTION');
  });
});

describe('shouldNudge', () => {
  it('returns true when turnCount >= 25 and dimensiBelum has items', () => {
    const snapshot = makeSnapshot({
      turnCount: 25,
      dimensiBelum: ['intensitas'],
    });
    expect(shouldNudge(snapshot)).toBe(true);
  });

  it('returns true when turnCount exceeds soft limit with remaining dimensions', () => {
    const snapshot = makeSnapshot({
      turnCount: 30,
      dimensiBelum: ['waktu', 'lesi'],
    });
    expect(shouldNudge(snapshot)).toBe(true);
  });

  it('returns false when turnCount < 25', () => {
    const snapshot = makeSnapshot({
      turnCount: 24,
      dimensiBelum: ['intensitas'],
    });
    expect(shouldNudge(snapshot)).toBe(false);
  });

  it('returns false when dimensiBelum is empty (all collected)', () => {
    const snapshot = makeSnapshot({
      turnCount: 30,
      dimensiBelum: [],
    });
    expect(shouldNudge(snapshot)).toBe(false);
  });

  it('returns false when both conditions are not met', () => {
    const snapshot = makeSnapshot({
      turnCount: 10,
      dimensiBelum: [],
    });
    expect(shouldNudge(snapshot)).toBe(false);
  });
});

describe('isTerminal', () => {
  it('returns true for CLOSED', () => {
    expect(isTerminal('CLOSED')).toBe(true);
  });

  it('returns false for GREETING', () => {
    expect(isTerminal('GREETING')).toBe(false);
  });

  it('returns false for COLLECTING', () => {
    expect(isTerminal('COLLECTING')).toBe(false);
  });

  it('returns false for ASKING_PERCEPTION', () => {
    expect(isTerminal('ASKING_PERCEPTION')).toBe(false);
  });

  it('returns false for OFFERING_RESULT', () => {
    expect(isTerminal('OFFERING_RESULT')).toBe(false);
  });

  it('returns false for SCREENING_COMPLETE', () => {
    expect(isTerminal('SCREENING_COMPLETE')).toBe(false);
  });

  it('returns false for FOLLOW_UP', () => {
    expect(isTerminal('FOLLOW_UP')).toBe(false);
  });
});
