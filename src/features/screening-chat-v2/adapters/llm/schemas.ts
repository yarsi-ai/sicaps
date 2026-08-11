/**
 * Zod schemas for LLM extraction response validation.
 *
 * Validates the JSON output from the extraction LLM call.
 * Defaults ensure partial responses are still usable.
 *
 * Note: gatalMalam is NOT part of LLM output — it's derived deterministically
 * from waktu.keywords in domain/scoring/engine.ts (deriveGatalMalam).
 */

import { z } from 'zod';

const DimensiEnum = z.enum([
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
]);

export const ExtractionSchema = z.object({
  dimensi: z.record(
    DimensiEnum,
    z.object({
      keywords: z.array(z.string()),
      negasi: z.array(z.string()).default([]),
    }),
  ),
  koreksi: z
    .array(
      z.object({
        dimensi: DimensiEnum,
        keyword_dibatalkan: z.string(),
        keyword_pengganti: z.string().nullable(),
      }),
    )
    .default([]),
  emosi: z.enum(['takut', 'malu', 'santai', 'netral', 'ingin_sembuh']).nullable(),
  unmapped: z.array(z.string()).default([]),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;

/**
 * Zod schema for LLM result text validation.
 *
 * Validates the 4-field JSON response from the result generation LLM call.
 * Each field has min/max length constraints to ensure meaningful content.
 */
export const resultTextSchema = z.object({
  conclusion: z.string().min(10).max(500),
  perceptionResponse: z.string().min(10).max(300),
  recommendation: z.string().min(10).max(500),
  suggestion: z.string().min(10).max(400),
});

export type ResultText = z.infer<typeof resultTextSchema>;
