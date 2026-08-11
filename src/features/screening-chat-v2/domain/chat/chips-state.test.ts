import { describe, it, expect } from 'vitest';

import { checkChipsTrigger, nextChipsSubState, allChipsAnswered } from './chips-state';
import type { ChipsContext } from './chips-state';

describe('checkChipsTrigger', () => {
  it('returns kontak chips when kontak dimension touched', () => {
    const result = checkChipsTrigger(['kontak'], []);

    expect(result).toEqual(['kontak']);
  });

  it('returns lokasi chips when lokasi_tubuh dimension touched', () => {
    const result = checkChipsTrigger(['lokasi_tubuh'], []);

    expect(result).toEqual(['lokasi']);
  });

  it('returns asrama chips when faktor_risiko dimension touched', () => {
    const result = checkChipsTrigger(['faktor_risiko'], []);

    expect(result).toEqual(['asrama']);
  });

  it('returns chips in CHIPS_ORDER when multiple dimensions touched', () => {
    const result = checkChipsTrigger(['faktor_risiko', 'lokasi_tubuh', 'kontak'], []);

    expect(result).toEqual(['kontak', 'lokasi', 'asrama']);
  });

  it('skips already answered chips', () => {
    const result = checkChipsTrigger(['kontak', 'lokasi_tubuh'], ['kontak']);

    expect(result).toEqual(['lokasi']);
  });

  it('returns empty when all touched dimensions already answered', () => {
    const result = checkChipsTrigger(['kontak'], ['kontak']);

    expect(result).toEqual([]);
  });

  it('returns empty for non-chips dimension (e.g. intensitas)', () => {
    const result = checkChipsTrigger(['intensitas'], []);

    expect(result).toEqual([]);
  });

  it('returns empty for waktu dimension (no chips mapping)', () => {
    const result = checkChipsTrigger(['waktu'], []);

    expect(result).toEqual([]);
  });

  it('returns empty for empty dimensions touched', () => {
    const result = checkChipsTrigger([], []);

    expect(result).toEqual([]);
  });
});

describe('nextChipsSubState', () => {
  it('transitions to CHIPS_PENDING with next item when queue has items', () => {
    const ctx: ChipsContext = {
      subState: 'CHIPS_ACTIVE',
      queue: ['lokasi', 'asrama'],
      activeChips: 'kontak',
      answered: ['kontak'],
    };

    const result = nextChipsSubState(ctx);

    expect(result.subState).toBe('CHIPS_PENDING');
    expect(result.activeChips).toBe('lokasi');
    expect(result.queue).toEqual(['asrama']);
    expect(result.answered).toEqual(['kontak']);
  });

  it('transitions to FREE_TEXT with null activeChips when queue is empty', () => {
    const ctx: ChipsContext = {
      subState: 'CHIPS_ACTIVE',
      queue: [],
      activeChips: 'tukar_alat',
      answered: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
    };

    const result = nextChipsSubState(ctx);

    expect(result.subState).toBe('FREE_TEXT');
    expect(result.activeChips).toBeNull();
    expect(result.queue).toEqual([]);
    expect(result.answered).toEqual(['kontak', 'lokasi', 'asrama', 'tukar_alat']);
  });

  it('dequeues first item and keeps the rest when queue has multiple items', () => {
    const ctx: ChipsContext = {
      subState: 'CHIPS_ACTIVE',
      queue: ['kontak', 'lokasi', 'asrama', 'tukar_alat'],
      activeChips: null,
      answered: [],
    };

    const result = nextChipsSubState(ctx);

    expect(result.subState).toBe('CHIPS_PENDING');
    expect(result.activeChips).toBe('kontak');
    expect(result.queue).toEqual(['lokasi', 'asrama', 'tukar_alat']);
  });

  it('preserves answered array unchanged', () => {
    const answered = ['kontak', 'lokasi'] as const;
    const ctx: ChipsContext = {
      subState: 'CHIPS_ACTIVE',
      queue: ['tukar_alat'],
      activeChips: 'asrama',
      answered: [...answered],
    };

    const result = nextChipsSubState(ctx);

    expect(result.answered).toEqual(['kontak', 'lokasi']);
  });
});

describe('allChipsAnswered', () => {
  it('returns true when all 4 chips types answered', () => {
    const result = allChipsAnswered(['kontak', 'lokasi', 'asrama', 'tukar_alat']);

    expect(result).toBe(true);
  });

  it('returns false when only 2 chips answered', () => {
    const result = allChipsAnswered(['kontak', 'lokasi']);

    expect(result).toBe(false);
  });

  it('returns false when empty', () => {
    const result = allChipsAnswered([]);

    expect(result).toBe(false);
  });

  it('returns true regardless of order', () => {
    const result = allChipsAnswered(['tukar_alat', 'asrama', 'kontak', 'lokasi']);

    expect(result).toBe(true);
  });

  it('returns false when only 1 answered', () => {
    const result = allChipsAnswered(['lokasi']);

    expect(result).toBe(false);
  });

  it('returns false when only 3 answered (missing tukar_alat)', () => {
    const result = allChipsAnswered(['kontak', 'lokasi', 'asrama']);

    expect(result).toBe(false);
  });
});
