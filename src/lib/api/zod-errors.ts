import type { ZodError } from 'zod';

/**
 * Converts a ZodError into an array of field-level error objects
 * suitable for the API error envelope's `details` field.
 */
export function zodToFieldErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
