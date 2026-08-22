/**
 * Wire contract for the visual detection API, shared by the route handlers that
 * produce it and the client code that consumes it.
 *
 * Pure schema definitions — no I/O, no Prisma, no Next.js. Having one source of
 * truth here is what stops the client from drifting onto a field the server
 * never sends.
 *
 * Requirements: 2.2, 8.2, 13.1
 */

import { z } from 'zod';

/** Envelope shape produced by `lib/api/response.ts`. */
export function apiEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.array(z.unknown()).nullable(),
      })
      .nullable(),
    meta: z.object({
      timestamp: z.string(),
      requestId: z.string(),
    }),
  });
}

export const visualResultSchema = z.enum(['POSITIVE', 'NEGATIVE']);
export const finalOutputSchema = z.enum(['SUSPECTED_SCABIES', 'NOT_SCABIES']);

/** Response body of `GET /api/screening/image/[sessionId]`. */
export const imageGateStatusSchema = z.object({
  resolved: z.boolean(),
  visualResult: visualResultSchema.nullable(),
  predictionFailed: z.boolean(),
});

/** Response body of `POST /api/screening/image`. */
export const imageSubmitResultSchema = z.object({
  imageId: z.string(),
  /** Server-authored bot reply, already persisted. The client renders it as-is. */
  botMessage: z.string(),
  /**
   * The question the phase after the gate owes, already persisted. Null when the
   * phase did not move or owes nothing.
   */
  followUpMessage: z.string().nullable(),
  /** The session phase after the upload, so the client can leave the gate. */
  phase: z.string(),
  visualResult: visualResultSchema,
  predictionFailed: z.boolean(),
  finalOutput: finalOutputSchema.nullable(),
});

export const imageGateStatusEnvelopeSchema = apiEnvelopeSchema(imageGateStatusSchema);
export const imageSubmitResultEnvelopeSchema = apiEnvelopeSchema(imageSubmitResultSchema);

export type ImageGateStatusResponse = z.infer<typeof imageGateStatusSchema>;
export type ImageSubmitResultResponse = z.infer<typeof imageSubmitResultSchema>;
