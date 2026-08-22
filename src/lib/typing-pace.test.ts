import { describe, it, expect } from 'vitest';

import { CONFIG } from './config';
import { typingDelayMs } from './typing-pace';

const { BASE_MS, PER_CHAR_MS, MAX_MS } = CONFIG.typingPace;

describe('typingDelayMs', () => {
  it('scales with the length of the message', () => {
    expect(typingDelayMs('ab')).toBe(BASE_MS + 2 * PER_CHAR_MS);
  });

  it('never drops below the floor, so a short reply still reads as typed', () => {
    expect(typingDelayMs('')).toBe(BASE_MS);
  });

  it('treats an absent message as having no length rather than throwing', () => {
    expect(typingDelayMs()).toBe(BASE_MS);
    expect(typingDelayMs(null)).toBe(BASE_MS);
  });

  it('clamps a long message to the ceiling', () => {
    expect(typingDelayMs('x'.repeat(10_000))).toBe(MAX_MS);
  });

  it('returns the ceiling exactly at the length where the two meet', () => {
    const atCeiling = (MAX_MS - BASE_MS) / PER_CHAR_MS;

    expect(typingDelayMs('x'.repeat(atCeiling))).toBe(MAX_MS);
    expect(typingDelayMs('x'.repeat(atCeiling - 1))).toBe(MAX_MS - PER_CHAR_MS);
  });
});
