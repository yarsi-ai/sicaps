import { describe, it, expect } from 'vitest';
import { deriveDisplayState } from './derive-state';

describe('deriveDisplayState', () => {
  describe('V2 phase (direct pass-through)', () => {
    it('returns GREETING when phase is GREETING', () => {
      expect(deriveDisplayState(null, [], null, 1, 'GREETING')).toBe('GREETING');
    });

    it('returns COLLECTING when phase is COLLECTING', () => {
      expect(deriveDisplayState(null, [], null, 3, 'COLLECTING')).toBe('COLLECTING');
    });

    it('returns AWAITING_IMAGE when phase is AWAITING_IMAGE', () => {
      expect(deriveDisplayState(null, [], null, 7, 'AWAITING_IMAGE')).toBe('AWAITING_IMAGE');
    });

    it('returns ASKING_PERCEPTION when phase is ASKING_PERCEPTION', () => {
      expect(deriveDisplayState(null, [], null, 8, 'ASKING_PERCEPTION')).toBe('ASKING_PERCEPTION');
    });

    it('returns OFFERING_RESULT when phase is OFFERING_RESULT', () => {
      expect(deriveDisplayState(null, [], null, 10, 'OFFERING_RESULT')).toBe('OFFERING_RESULT');
    });

    it('returns CLOSED when phase is CLOSED', () => {
      expect(deriveDisplayState(null, [], null, 5, 'CLOSED')).toBe('CLOSED');
    });

    it('returns FOLLOW_UP when phase is FOLLOW_UP', () => {
      expect(deriveDisplayState(null, [], null, 12, 'FOLLOW_UP')).toBe('FOLLOW_UP');
    });
  });

  describe('V1 fallback (when phase is null)', () => {
    it('returns COMPLETED when status is COMPLETED', () => {
      expect(deriveDisplayState('COMPLETED', [], null, 10, null)).toBe('COMPLETED');
    });

    it('returns COLLECTING when 6 categories covered and no phase', () => {
      const cats = ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'];
      expect(deriveDisplayState('IN_PROGRESS', cats, null, 8, null)).toBe('COLLECTING');
    });

    it('returns IDLE when turnsCount is 0', () => {
      expect(deriveDisplayState(null, [], null, 0, null)).toBe('IDLE');
    });

    it('returns COLLECTING as default fallback', () => {
      expect(deriveDisplayState(null, [], null, 1, null)).toBe('COLLECTING');
    });
  });
});
