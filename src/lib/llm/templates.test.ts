import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getFallbackOutput } from './templates';
import type { FallbackLocale, FallbackRiskLevel } from './templates';

/**
 * Property-based tests for fallback output templates.
 *
 * Validates: Requirements 4.6
 */

describe('getFallbackOutput property tests', () => {
  const localeArb = fc.constantFrom<FallbackLocale>('id', 'en');
  const riskLevelArb = fc.constantFrom<FallbackRiskLevel>('HIGH', 'MODERATE', 'LOW');

  it('Property 11: Fallback output template completeness', () => {
    fc.assert(
      fc.property(localeArb, riskLevelArb, (locale, riskLevel) => {
        const result = getFallbackOutput(locale, riskLevel);

        expect(typeof result.conclusion).toBe('string');
        expect(result.conclusion.length).toBeGreaterThan(0);

        expect(typeof result.recommendation).toBe('string');
        expect(result.recommendation.length).toBeGreaterThan(0);

        expect(result.perceptionResponse).toBeNull();
        expect(result.personalizedSuggestion).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
