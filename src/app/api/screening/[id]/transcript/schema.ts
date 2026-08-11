import { z } from 'zod';

export const transcriptParamsSchema = z.object({
  id: z.string().uuid(),
});

export type TranscriptParams = z.infer<typeof transcriptParamsSchema>;
