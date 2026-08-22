/**
 * Vision API response contract — schema and pure parsing.
 *
 * This is a lib module: pure logic only. MUST NOT import Prisma, services, or
 * Next.js modules, and MUST NOT perform I/O. The HTTP call that produces these
 * responses lives in `services/vision-api.service.ts`.
 *
 * Requirements: 6.3, 6.4, 13.1
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod Schema — the external API's actual response shape, confirmed against a
// live example:
//
//   { "success": true, "prediction": "Not Scabies", "confidence": 86.96,
//     "details": { "scabies": 13.04, "not_scabies": 86.96 } }
//
// This does not match our internal vocabulary directly: `prediction` uses
// "Scabies"/"Not Scabies" rather than POSITIVE/NEGATIVE, and `confidence` is
// the confidence of whichever class was predicted, not always the "positive"
// one. parseVisionResponse() below is the single place that translates
// between the two — nothing downstream of this module ever sees this shape.
// ---------------------------------------------------------------------------

export const visionResponseSchema = z.object({
  success: z.boolean(),
  prediction: z.enum(['Scabies', 'Not Scabies']),
  confidence: z.number().min(0).max(100),
  details: z.record(z.number()).optional(),
});

export type VisionResponse = z.infer<typeof visionResponseSchema>;

/** Our internal vocabulary. Stable regardless of what the external API calls things. */
export interface VisionPredictionResult {
  result: 'POSITIVE' | 'NEGATIVE';
  confidence?: number;
  rawResult?: Record<string, unknown>;
}

const PREDICTION_TO_RESULT: Record<VisionResponse['prediction'], 'POSITIVE' | 'NEGATIVE'> = {
  Scabies: 'POSITIVE',
  'Not Scabies': 'NEGATIVE',
};

/**
 * Parse an unknown value (a decoded JSON body from the external vision API)
 * against the response contract, and translate it into our internal vocabulary.
 *
 * Returns a discriminated result rather than throwing, so the caller decides
 * how a malformed response maps onto its own error type.
 *
 * `success: false` is treated as a parse failure rather than a valid negative
 * result: it signals the model did not produce a usable prediction, and the
 * caller's retry loop should treat it exactly like a malformed body.
 */
export function parseVisionResponse(
  raw: unknown,
): { ok: true; value: VisionPredictionResult } | { ok: false; message: string } {
  const parsed = visionResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.message };
  }

  if (!parsed.data.success) {
    return { ok: false, message: 'Vision API reported an unsuccessful prediction' };
  }

  return {
    ok: true,
    value: {
      result: PREDICTION_TO_RESULT[parsed.data.prediction],
      confidence: parsed.data.confidence,
      rawResult: parsed.data.details,
    },
  };
}
