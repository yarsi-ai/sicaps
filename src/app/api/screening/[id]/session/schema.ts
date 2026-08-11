import { z } from 'zod';

export const sessionParamsSchema = z.object({
  id: z.string().uuid(),
});

export const tokenQuerySchema = z.object({
  token: z.string().uuid(),
});

export type SessionParams = z.infer<typeof sessionParamsSchema>;
export type TokenQuery = z.infer<typeof tokenQuerySchema>;
