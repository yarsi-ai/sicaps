import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';

import { pdfParamsSchema, pdfTokenQuerySchema } from './schema';

describe('pdfParamsSchema', () => {
  it('parses a valid UUID id', () => {
    const result = pdfParamsSchema.safeParse({ id: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = pdfParamsSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = pdfParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when id is missing', () => {
    const result = pdfParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('pdfTokenQuerySchema', () => {
  it('parses a valid UUID token', () => {
    const result = pdfTokenQuerySchema.safeParse({ token: randomUUID() });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = pdfTokenQuerySchema.safeParse({ token: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = pdfTokenQuerySchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when token is missing', () => {
    const result = pdfTokenQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
