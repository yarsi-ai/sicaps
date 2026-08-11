import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';

import { sessionParamsSchema, tokenQuerySchema } from './schema';

describe('sessionParamsSchema', () => {
  it('parses a valid UUID id', () => {
    const result = sessionParamsSchema.safeParse({ id: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = sessionParamsSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = sessionParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when id is missing', () => {
    const result = sessionParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('tokenQuerySchema', () => {
  it('parses a valid UUID token', () => {
    const result = tokenQuerySchema.safeParse({ token: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = tokenQuerySchema.safeParse({ token: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = tokenQuerySchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when token is missing', () => {
    const result = tokenQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
