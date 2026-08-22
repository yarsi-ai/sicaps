// Feature: visual-detection, Property 3: External API Response Parsing Round-Trip

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { visionResponseSchema, parseVisionResponse } from './vision-response';

/**
 * Property-based tests for the vision response schema parsing.
 *
 * **Validates: Requirements 6.3, 6.4**
 *
 * The external API's actual shape is
 * `{ success: boolean, prediction: 'Scabies' | 'Not Scabies', confidence: number
 * in [0,100], details?: Record<string, number> }`. For all objects conforming
 * to that shape with `success: true`, parsing SHALL succeed and SHALL translate
 * `prediction` into our internal `result` vocabulary (`Scabies` -> `POSITIVE`,
 * `Not Scabies` -> `NEGATIVE`).
 *
 * For all objects that do not conform (missing `prediction`, `prediction` not
 * in the enum, `confidence` outside [0,100], or `success: false`), parsing
 * SHALL fail.
 */

/** Arbitrary for a valid prediction enum value */
const validPredictionArb: fc.Arbitrary<'Scabies' | 'Not Scabies'> = fc.constantFrom(
  'Scabies',
  'Not Scabies',
);

/** Arbitrary for a valid confidence value (0-100 inclusive) */
const validConfidenceArb: fc.Arbitrary<number> = fc.double({ min: 0, max: 100, noNaN: true });

/**
 * Arbitrary for a valid `details` object.
 *
 * `__proto__` is excluded as a key: assigning it during object construction
 * mutates the prototype instead of creating an own property, so a generated
 * object carrying that key can never round-trip through structural equality.
 * That is a limitation of the generator, not of the schema under test.
 */
const validDetailsArb: fc.Arbitrary<Record<string, number> | undefined> = fc.option(
  fc.dictionary(
    fc.string().filter((key) => key !== '__proto__'),
    fc.double({ noNaN: true }),
  ),
  { nil: undefined },
);

/** Arbitrary for a fully valid, successful vision response */
const validResponseArb: fc.Arbitrary<{
  success: true;
  prediction: 'Scabies' | 'Not Scabies';
  confidence: number;
  details?: Record<string, number>;
}> = fc.record({
  success: fc.constant(true as const),
  prediction: validPredictionArb,
  confidence: validConfidenceArb,
  details: validDetailsArb,
});

describe('Feature: visual-detection, Property 3: External API Response Parsing Round-Trip', () => {
  it('parsing succeeds for all valid, successful schema-conforming objects', () => {
    fc.assert(
      fc.property(validResponseArb, (response) => {
        const parseResult = visionResponseSchema.safeParse(response);
        expect(parseResult.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('translates "Scabies" to POSITIVE and "Not Scabies" to NEGATIVE', () => {
    fc.assert(
      fc.property(validResponseArb, (response) => {
        const parsed = parseVisionResponse(response);

        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.value.result).toBe(
            response.prediction === 'Scabies' ? 'POSITIVE' : 'NEGATIVE',
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('preserves confidence through the translation', () => {
    fc.assert(
      fc.property(validPredictionArb, validConfidenceArb, (prediction, confidence) => {
        const response = { success: true, prediction, confidence };
        const parsed = parseVisionResponse(response);

        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.value.confidence).toBe(confidence);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('carries details through as rawResult when present', () => {
    fc.assert(
      fc.property(
        validPredictionArb,
        validConfidenceArb,
        fc.dictionary(
          fc.string().filter((key) => key !== '__proto__'),
          fc.double({ noNaN: true }),
        ),
        (prediction, confidence, details) => {
          const response = { success: true, prediction, confidence, details };
          const parsed = parseVisionResponse(response);

          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            expect(parsed.value.rawResult).toEqual(details);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('parsing succeeds when details is omitted', () => {
    fc.assert(
      fc.property(validPredictionArb, validConfidenceArb, (prediction, confidence) => {
        const response = { success: true, prediction, confidence };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(true);
        if (parseResult.success) {
          expect(parseResult.data.details).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  // --- Invalid / unsuccessful input tests ---

  it('parsing fails when success is false, even with an otherwise valid body', () => {
    fc.assert(
      fc.property(validPredictionArb, validConfidenceArb, (prediction, confidence) => {
        const response = { success: false, prediction, confidence };
        const parsed = parseVisionResponse(response);

        expect(parsed.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when prediction is missing', () => {
    fc.assert(
      fc.property(validConfidenceArb, validDetailsArb, (confidence, details) => {
        const response: Record<string, unknown> = { success: true, confidence };
        if (details !== undefined) response.details = details;

        const parseResult = visionResponseSchema.safeParse(response);
        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when prediction is not in the enum', () => {
    const invalidPredictionArb = fc.string().filter((s) => s !== 'Scabies' && s !== 'Not Scabies');

    fc.assert(
      fc.property(invalidPredictionArb, validConfidenceArb, (invalidPrediction, confidence) => {
        const response = { success: true, prediction: invalidPrediction, confidence };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when confidence is missing', () => {
    fc.assert(
      fc.property(validPredictionArb, (prediction) => {
        const response = { success: true, prediction };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when confidence is below 0', () => {
    const belowZeroConfidenceArb = fc.double({
      min: -1_000_000,
      max: -Number.MIN_VALUE,
      noNaN: true,
    });

    fc.assert(
      fc.property(validPredictionArb, belowZeroConfidenceArb, (prediction, confidence) => {
        const response = { success: true, prediction, confidence };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when confidence is above 100', () => {
    // Use Number.EPSILON relative to 100 to ensure values are strictly > 100
    // Note: 100 + Number.MIN_VALUE === 100 due to floating-point precision
    const aboveHundredConfidenceArb = fc.double({
      min: 100 + 100 * Number.EPSILON,
      max: 1_000_000,
      noNaN: true,
      minExcluded: true, // Ensure min is strictly excluded
    });

    fc.assert(
      fc.property(validPredictionArb, aboveHundredConfidenceArb, (prediction, confidence) => {
        const response = { success: true, prediction, confidence };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing fails when confidence is NaN', () => {
    const response = { success: true, prediction: 'Scabies', confidence: NaN };
    const parseResult = visionResponseSchema.safeParse(response);

    expect(parseResult.success).toBe(false);
  });

  it('parsing fails when confidence is a non-number type', () => {
    const nonNumberArb = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.array(fc.integer()),
      fc.dictionary(fc.string(), fc.string()),
    );

    fc.assert(
      fc.property(validPredictionArb, nonNumberArb, (prediction, invalidConfidence) => {
        const response = { success: true, prediction, confidence: invalidConfidence };
        const parseResult = visionResponseSchema.safeParse(response);

        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing handles boundary values for confidence correctly', () => {
    // Exactly 0 should pass
    const atZero = visionResponseSchema.safeParse({
      success: true,
      prediction: 'Scabies',
      confidence: 0,
    });
    expect(atZero.success).toBe(true);

    // Exactly 100 should pass
    const atHundred = visionResponseSchema.safeParse({
      success: true,
      prediction: 'Scabies',
      confidence: 100,
    });
    expect(atHundred.success).toBe(true);

    // Slightly below 0 should fail
    const belowZero = visionResponseSchema.safeParse({
      success: true,
      prediction: 'Scabies',
      confidence: -0.0001,
    });
    expect(belowZero.success).toBe(false);

    // Slightly above 100 should fail
    const aboveHundred = visionResponseSchema.safeParse({
      success: true,
      prediction: 'Scabies',
      confidence: 100.0001,
    });
    expect(aboveHundred.success).toBe(false);
  });

  it('parsing fails for completely invalid objects (non-objects)', () => {
    const invalidInputArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.jsonValue()),
    );

    fc.assert(
      fc.property(invalidInputArb, (invalidInput) => {
        const parseResult = visionResponseSchema.safeParse(invalidInput);
        expect(parseResult.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
