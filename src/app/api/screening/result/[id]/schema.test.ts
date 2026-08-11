import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';

import { resultParamsSchema, resultTokenQuerySchema } from './schema';

describe('resultParamsSchema', () => {
  it('parses a valid UUID id', () => {
    const result = resultParamsSchema.safeParse({ id: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = resultParamsSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = resultParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when id is missing', () => {
    const result = resultParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('resultTokenQuerySchema', () => {
  it('parses a valid UUID token', () => {
    const result = resultTokenQuerySchema.safeParse({ token: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = resultTokenQuerySchema.safeParse({ token: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = resultTokenQuerySchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when token is missing', () => {
    const result = resultTokenQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
