import { z } from 'zod';

/**
 * Schema for PIN verification request.
 * Validates: Requirements 3.3
 */
export const verifyPinSchema = z.object({
  pin: z.string().min(1, 'PIN is required'),
  redirect: z.string().optional(), // Return path after auth
});

export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
