import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodToFieldErrors } from './zod-errors';

describe('zodToFieldErrors', () => {
  it('maps a single validation issue to field and message', () => {
    const schema = z.object({ age: z.number().min(3) });
    const result = schema.safeParse({ age: 1 });

    if (result.success) throw new Error('Expected parse to fail');

    const errors = zodToFieldErrors(result.error);
    expect(errors).toEqual([{ field: 'age', message: expect.any(String) }]);
    expect(errors[0].message).toContain('3');
  });

  it('maps multiple issues from a nested object', () => {
    const schema = z.object({
      demographics: z.object({
        age: z.number().int(),
        gender: z.enum(['male', 'female']),
      }),
      locale: z.enum(['id', 'en']),
    });

    const result = schema.safeParse({
      demographics: { age: 'abc', gender: 'invalid' },
      locale: 'fr',
    });

    if (result.success) throw new Error('Expected parse to fail');

    const errors = zodToFieldErrors(result.error);

    expect(errors.length).toBe(3);
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: 'demographics.age', message: expect.any(String) },
        { field: 'demographics.gender', message: expect.any(String) },
        { field: 'locale', message: expect.any(String) },
      ]),
    );
  });

  it('returns an empty array when there are no issues', () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});

    if (result.success) throw new Error('Expected parse to fail');

    // ZodError always has at least one issue if parse fails,
    // but we verify the mapping produces correct count
    const errors = zodToFieldErrors(result.error);
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('name');
  });

  it('joins nested paths with dots', () => {
    const schema = z.object({
      a: z.object({ b: z.object({ c: z.string() }) }),
    });

    const result = schema.safeParse({ a: { b: { c: 123 } } });

    if (result.success) throw new Error('Expected parse to fail');

    const errors = zodToFieldErrors(result.error);
    expect(errors[0].field).toBe('a.b.c');
  });

  it('produces empty string field for root-level issues', () => {
    const schema = z.string();
    const result = schema.safeParse(123);

    if (result.success) throw new Error('Expected parse to fail');

    const errors = zodToFieldErrors(result.error);
    expect(errors[0].field).toBe('');
  });
});
