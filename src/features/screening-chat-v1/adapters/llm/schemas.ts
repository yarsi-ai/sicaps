import { z } from 'zod';

/** Schema for a single extracted keyword from LLM */
export const llmKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  confidence: z.enum(['high', 'medium', 'low']),
});

/** Full chat response schema from LLM */
export const llmChatResponseSchema = z.object({
  reply: z.string().min(1),
  extraction: z.object({
    intensitas: z.array(llmKeywordSchema),
    waktu: z.array(llmKeywordSchema),
    lokasi_tubuh: z.array(llmKeywordSchema),
    kontak: z.array(llmKeywordSchema),
    lesi: z.array(llmKeywordSchema),
    faktor_risiko: z.array(llmKeywordSchema),
  }),
  categories_covered: z.array(z.string()),
  next_category: z.string().nullable(),
  should_follow_up: z.boolean(),
});

export type LLMChatResponse = z.infer<typeof llmChatResponseSchema>;

/** Schema for output generation response (4-part result) */
export const llmOutputResponseSchema = z.object({
  conclusion: z.string().min(1),
  perceptionResponse: z.string().nullable(),
  recommendation: z.string().min(1),
  personalizedSuggestion: z.string().nullable(),
});

export type LLMOutputResponse = z.infer<typeof llmOutputResponseSchema>;
