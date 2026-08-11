import { describe, it, expect } from 'vitest';
import { verifyShareToken } from './token';

describe('verifyShareToken', () => {
  it('returns true for identical strings', () => {
    const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(verifyShareToken(token, token)).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    const provided = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const stored = 'z9y8x7w6-v5u4-3210-zyxw-vu0987654321';
    expect(verifyShareToken(provided, stored)).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(verifyShareToken('short', 'a-much-longer-string')).toBe(false);
  });

  it('returns false for empty provided vs non-empty stored', () => {
    expect(verifyShareToken('', 'some-token')).toBe(false);
  });

  it('returns false for non-empty provided vs empty stored', () => {
    expect(verifyShareToken('some-token', '')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(verifyShareToken('', '')).toBe(true);
  });

  it('handles Unicode characters correctly', () => {
    const token = 'tëst-tökén-wîth-ünïcödé';
    expect(verifyShareToken(token, token)).toBe(true);
  });

  it('detects single character difference', () => {
    const stored = 'abc123def456';
    const provided = 'abc123def457';
    expect(verifyShareToken(provided, stored)).toBe(false);
  });
});
