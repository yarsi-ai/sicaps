import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLLMResponse } from './parser';
import type { LLMChatResponse } from './schemas';

/**
 * Property-based tests for LLM response parser.
 *
 * Validates: Requirements 5.8
 */

/** Arbitrary for a single LLM keyword entry */
const llmKeywordArb = fc.record({
  keyword: fc.string({ minLength: 1, maxLength: 200 }),
  confidence: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
});

/** Arbitrary for the extraction object with 6 category arrays */
const extractionArb = fc.record({
  intensitas: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
  waktu: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
  lokasi_tubuh: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
  kontak: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
  lesi: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
  faktor_risiko: fc.array(llmKeywordArb, { minLength: 0, maxLength: 5 }),
});

/** Arbitrary for a valid LLMChatResponse object */
const llmChatResponseArb: fc.Arbitrary<LLMChatResponse> = fc.record({
  reply: fc.string({ minLength: 1, maxLength: 500 }),
  extraction: extractionArb,
  categories_covered: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
    minLength: 0,
    maxLength: 6,
  }),
  next_category: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  should_follow_up: fc.boolean(),
});

describe('parseLLMResponse property tests', () => {
  it('Property 1: Parser round-trip preserves valid responses', () => {
    fc.assert(
      fc.property(llmChatResponseArb, (response) => {
        const serialized = JSON.stringify(response);
        const result = parseLLMResponse(serialized);

        expect(result.status).toBe('success');
        if (result.status === 'success') {
          expect(result.data).toEqual(response);
        }
      }),
      { numRuns: 100 },
    );
  });
});
