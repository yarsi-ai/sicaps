import { z } from 'zod';

export const feedbackSchema = z.object({
  turnNumber: z.number().int().min(1),
  evaluatorType: z.enum(['DEVELOPER', 'DOCTOR', 'RESEARCHER']),
  isAccurate: z.boolean(),
  notes: z.string().optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
