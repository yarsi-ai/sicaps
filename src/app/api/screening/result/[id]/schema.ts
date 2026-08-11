import { z } from 'zod';

export const resultParamsSchema = z.object({
  id: z.string().uuid(),
});

export const resultTokenQuerySchema = z.object({
  token: z.string().uuid(),
});

export type ResultParams = z.infer<typeof resultParamsSchema>;
export type ResultTokenQuery = z.infer<typeof resultTokenQuerySchema>;
