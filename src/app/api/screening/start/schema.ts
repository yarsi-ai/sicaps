import { z } from 'zod';

/**
 * V1 start request schema — requires demographics for scoring context.
 */
export const startRequestSchema = z.object({
  demographics: z.object({
    name: z.string().max(100).nullable().optional(),
    age: z.number().int().min(3).max(120),
    gender: z.enum(['male', 'female']),
    educationLevel: z.enum(['elementary', 'junior_high', 'senior_high']),
  }),
  locale: z.enum(['id', 'en']),
});

/**
 * V2 start request schema — minimal input for conversational screening.
 * Demographics collected conversationally by the LLM.
 */
export const startV2RequestSchema = z.object({
  locale: z.enum(['id', 'en']).default('id'),
  mode: z.string().optional(),
});

export type StartRequest = z.infer<typeof startRequestSchema>;
export type StartV2Request = z.infer<typeof startV2RequestSchema>;
