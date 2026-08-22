import { z } from 'zod';

/**
 * Schema for validating the sessionId URL parameter.
 *
 * Requirements: 5.1 (via getImageGateStatus)
 */
export const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
});

export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>;
