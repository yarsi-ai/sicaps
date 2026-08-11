// Feature: screening-api, Property 9: Zod start schema rejects invalid ages
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { startRequestSchema } from './schema';

// **Validates: Requirements 10.2, 1.5**

/** Valid request body with a placeholder age that gets overridden per test case */
function makeRequest(age: number) {
  return {
    demographics: {
      name: 'Test',
      age,
      gender: 'male' as const,
      educationLevel: 'junior_high' as const,
    },
    locale: 'id' as const,
  };
}

describe('startRequestSchema age validation (property)', () => {
  it('accepts any integer within [3, 120]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 120 }), (age) => {
        const result = startRequestSchema.safeParse(makeRequest(age));
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any integer below 3', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 2 }), (age) => {
        const result = startRequestSchema.safeParse(makeRequest(age));
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any integer above 120', () => {
    fc.assert(
      fc.property(fc.integer({ min: 121, max: 10000 }), (age) => {
        const result = startRequestSchema.safeParse(makeRequest(age));
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
