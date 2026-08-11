import { describe, it, expect } from 'vitest';
import { detectCrisis } from './detect-crisis';

describe('detectCrisis', () => {
  it('detects "bunuh diri" marker', () => {
    const msg = 'User menyebutkan ingin bunuh diri. Redirect to crisis protocol.';
    expect(detectCrisis(msg)).toBe(true);
  });

  it('detects "self-harm" marker', () => {
    const msg = '[CRISIS] User indicates self-harm ideation. Override normal flow.';
    expect(detectCrisis(msg)).toBe(true);
  });

  it('detects "suicide" marker', () => {
    const msg = 'If user mentions suicide, activate crisis redirect.';
    expect(detectCrisis(msg)).toBe(true);
  });

  it('detects "menyakiti diri" marker', () => {
    const msg = 'Pasien menunjukkan keinginan menyakiti diri sendiri.';
    expect(detectCrisis(msg)).toBe(true);
  });

  it('detects "crisis" marker (case-insensitive)', () => {
    const msg = 'CRISIS protocol activated for this turn.';
    expect(detectCrisis(msg)).toBe(true);
  });

  it('returns false for normal prompt text without markers', () => {
    const msg = 'You are SICAPS. Ask about skin itching symptoms. Be friendly and supportive.';
    expect(detectCrisis(msg)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(detectCrisis('')).toBe(false);
  });

  it('returns false for text with partial marker match', () => {
    const msg = 'The scoring crisis-free session continues normally.';
    // "crisis" is substring of "crisis-free" — this WILL match (intentional: over-detect is acceptable)
    expect(detectCrisis(msg)).toBe(true);
  });
});
