import { describe, it, expect } from 'vitest';

import { chatRequestSchema } from './schema';

describe('chatRequestSchema', () => {
  it('validates a valid request with all fields', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Saya gatal di tangan',
      isVoice: true,
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('defaults isVoice to false when not provided', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Hello',
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isVoice).toBe(false);
    }
  });

  it('rejects invalid UUID for sessionId', () => {
    const input = {
      sessionId: 'not-a-uuid',
      message: 'Hello',
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: '',
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts message of any length (max length enforced by route handler)', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'a'.repeat(2001),
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts message at exactly 2000 characters', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'a'.repeat(2000),
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects missing sessionId', () => {
    const input = {
      message: 'Hello',
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean isVoice', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Hello',
      isVoice: 'yes',
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
