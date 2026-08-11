import { z } from 'zod';

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const localeSchema = z.enum(['id', 'en']);

export const categoryNameSchema = z.enum([
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
]);

export const extractedKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  confidence: confidenceSchema,
});

export const categoryExtractionSchema = z.object({
  intensitas: z.array(extractedKeywordSchema),
  waktu: z.array(extractedKeywordSchema),
  lokasi_tubuh: z.array(extractedKeywordSchema),
  kontak: z.array(extractedKeywordSchema),
  lesi: z.array(extractedKeywordSchema),
  faktor_risiko: z.array(extractedKeywordSchema),
});

export const pillSelectionSchema = z.object({
  pillId: z.string().min(1),
  category: categoryNameSchema,
});

export const pillSelectionsSchema = z.array(pillSelectionSchema).min(1);

export const scoringInputSchema = z.object({
  extraction: categoryExtractionSchema,
  locale: localeSchema,
  turn: z.number().int().positive(),
});
