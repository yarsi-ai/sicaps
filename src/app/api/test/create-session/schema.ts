import { z } from 'zod';

export const educationLevelSchema = z.enum(['ELEMENTARY', 'JUNIOR_HIGH', 'SENIOR_HIGH']);

export const createTestSessionSchema = z.object({
  age: z.number().int().min(6).max(99),
  gender: z.enum(['male', 'female']),
  educationLevel: educationLevelSchema,
  locale: z.enum(['id', 'en']).default('id'),
});

export type CreateTestSessionInput = z.infer<typeof createTestSessionSchema>;
