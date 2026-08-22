// Feature: visual-detection, Property 5: Final Output Combination Table Correctness

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  combineFinalOutput,
  type ChatbotRiskLevel,
  type VisualResult,
  type FinalOutput,
} from './result-combiner';

/**
 * Property-based tests for the result combiner module.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */

const ALL_RISK_LEVELS: ChatbotRiskLevel[] = ['HIGH', 'MODERATE', 'LOW'];
const ALL_VISUAL_RESULTS: VisualResult[] = ['POSITIVE', 'NEGATIVE'];

/** Arbitrary for a valid ChatbotRiskLevel */
const riskLevelArb: fc.Arbitrary<ChatbotRiskLevel> = fc.constantFrom(...ALL_RISK_LEVELS);

/** Arbitrary for a valid VisualResult */
const visualResultArb: fc.Arbitrary<VisualResult> = fc.constantFrom(...ALL_VISUAL_RESULTS);

describe('Feature: visual-detection, Property 5: Final Output Combination Table Correctness', () => {
  /**
   * For all combinations of Chatbot_Risk_Level (`HIGH`, `MODERATE`, `LOW`) and
   * Visual_Result (`POSITIVE`, `NEGATIVE`), `combineFinalOutput` SHALL return
   * `SUSPECTED_SCABIES` when Chatbot_Risk_Level is `HIGH` regardless of Visual_Result,
   * `SUSPECTED_SCABIES` when Chatbot_Risk_Level is `MODERATE` and Visual_Result is `POSITIVE`,
   * and `NOT_SCABIES` otherwise (including LOW + POSITIVE).
   */

  it('returns SUSPECTED_SCABIES when Chatbot_Risk_Level is HIGH regardless of Visual_Result', () => {
    fc.assert(
      fc.property(visualResultArb, (visualResult) => {
        const result = combineFinalOutput('HIGH', visualResult);
        expect(result).toBe('SUSPECTED_SCABIES');
      }),
      { numRuns: 100 },
    );
  });

  it('returns SUSPECTED_SCABIES when Chatbot_Risk_Level is MODERATE and Visual_Result is POSITIVE', () => {
    fc.assert(
      fc.property(
        fc.constant('MODERATE' as ChatbotRiskLevel),
        fc.constant('POSITIVE' as VisualResult),
        (risk, visual) => {
          const result = combineFinalOutput(risk, visual);
          expect(result).toBe('SUSPECTED_SCABIES');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns NOT_SCABIES when Chatbot_Risk_Level is MODERATE and Visual_Result is NEGATIVE', () => {
    fc.assert(
      fc.property(
        fc.constant('MODERATE' as ChatbotRiskLevel),
        fc.constant('NEGATIVE' as VisualResult),
        (risk, visual) => {
          const result = combineFinalOutput(risk, visual);
          expect(result).toBe('NOT_SCABIES');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns NOT_SCABIES when Chatbot_Risk_Level is LOW and Visual_Result is POSITIVE', () => {
    fc.assert(
      fc.property(
        fc.constant('LOW' as ChatbotRiskLevel),
        fc.constant('POSITIVE' as VisualResult),
        (risk, visual) => {
          const result = combineFinalOutput(risk, visual);
          expect(result).toBe('NOT_SCABIES');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns NOT_SCABIES when Chatbot_Risk_Level is LOW and Visual_Result is NEGATIVE', () => {
    fc.assert(
      fc.property(
        fc.constant('LOW' as ChatbotRiskLevel),
        fc.constant('NEGATIVE' as VisualResult),
        (risk, visual) => {
          const result = combineFinalOutput(risk, visual);
          expect(result).toBe('NOT_SCABIES');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('follows the complete truth table for all combinations', () => {
    /**
     * Truth table per design document:
     * | Chatbot Risk | AI Visual | Output            |
     * |--------------|-----------|-------------------|
     * | HIGH         | POSITIVE  | SUSPECTED_SCABIES |
     * | HIGH         | NEGATIVE  | SUSPECTED_SCABIES |
     * | MODERATE     | POSITIVE  | SUSPECTED_SCABIES |
     * | MODERATE     | NEGATIVE  | NOT_SCABIES       |
     * | LOW          | POSITIVE  | NOT_SCABIES       |
     * | LOW          | NEGATIVE  | NOT_SCABIES       |
     */
    fc.assert(
      fc.property(riskLevelArb, visualResultArb, (risk, visual) => {
        const result = combineFinalOutput(risk, visual);

        // Expected output based on the truth table
        let expected: FinalOutput;
        if (risk === 'HIGH') {
          expected = 'SUSPECTED_SCABIES';
        } else if (risk === 'MODERATE' && visual === 'POSITIVE') {
          expected = 'SUSPECTED_SCABIES';
        } else {
          expected = 'NOT_SCABIES';
        }

        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('HIGH risk always dominates: SUSPECTED_SCABIES regardless of visual result', () => {
    fc.assert(
      fc.property(fc.constant('HIGH' as ChatbotRiskLevel), visualResultArb, (risk, visual) => {
        const result = combineFinalOutput(risk, visual);
        // HIGH risk always produces SUSPECTED_SCABIES, visual result is irrelevant
        expect(result).toBe('SUSPECTED_SCABIES');
      }),
      { numRuns: 100 },
    );
  });

  it('MODERATE + POSITIVE yields SUSPECTED_SCABIES', () => {
    const result = combineFinalOutput('MODERATE', 'POSITIVE');
    expect(result).toBe('SUSPECTED_SCABIES');
  });

  it('LOW risk always yields NOT_SCABIES regardless of visual result', () => {
    fc.assert(
      fc.property(fc.constant('LOW' as ChatbotRiskLevel), visualResultArb, (risk, visual) => {
        const result = combineFinalOutput(risk, visual);
        expect(result).toBe('NOT_SCABIES');
      }),
      { numRuns: 100 },
    );
  });

  it('is a pure function: same inputs always produce same output', () => {
    fc.assert(
      fc.property(riskLevelArb, visualResultArb, (risk, visual) => {
        const result1 = combineFinalOutput(risk, visual);
        const result2 = combineFinalOutput(risk, visual);
        const result3 = combineFinalOutput(risk, visual);

        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 },
    );
  });

  it('output is always one of the two valid FinalOutput values', () => {
    fc.assert(
      fc.property(riskLevelArb, visualResultArb, (risk, visual) => {
        const result = combineFinalOutput(risk, visual);
        expect(['SUSPECTED_SCABIES', 'NOT_SCABIES']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });
});
