import { z } from 'zod';

import { zodToFieldErrors } from '@/lib/api/zod-errors';
import { CONFIG } from '@/lib/config';

/**
 * Schema for multipart/form-data fields on POST /api/screening/image.
 *
 * Note: The actual file buffer is extracted from FormData and validated separately.
 * This schema validates the text fields (sessionId, consentGiven).
 *
 * Requirements: 4.3, 4.4, 4.5, 13.3
 */
export const imageUploadFormSchema = z.object({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
  consentGiven: z
    .string()
    .refine((val) => val === 'true', { message: 'consentGiven must be "true"' }),
});

/**
 * Schema for validating image file metadata.
 * Used after extracting the File from FormData.
 *
 * Requirements: 4.4, 4.5
 */
export const imageFileMetadataSchema = z.object({
  mimeType: z
    .string()
    .refine(
      (val) => (CONFIG.visualDetection.ALLOWED_MIME_TYPES as readonly string[]).includes(val),
      {
        message: `MIME type must be one of: ${CONFIG.visualDetection.ALLOWED_MIME_TYPES.join(', ')}`,
      },
    ),
  fileSize: z
    .number()
    .int()
    .positive({ message: 'File size must be greater than 0' })
    .max(CONFIG.visualDetection.MAX_FILE_SIZE_BYTES, {
      message: `File size must not exceed ${CONFIG.visualDetection.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
    }),
  fileName: z.string().min(1, { message: 'File name is required' }),
});

export type ImageUploadFormData = z.infer<typeof imageUploadFormSchema>;
export type ImageFileMetadata = z.infer<typeof imageFileMetadataSchema>;

/** A validated upload request, ready to hand to the service layer. */
export interface ParsedImageUploadRequest {
  sessionId: string;
  consentGiven: boolean;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/** Field-level validation failure, shaped for the API error envelope. */
export interface ImageUploadRequestError {
  message: string;
  details: { field: string; message: string }[];
}

/**
 * Validate a multipart upload request end to end and adapt it into the service
 * input type.
 *
 * Keeps the route handler declarative: every field check, the file-presence
 * check, and the File -> Buffer conversion live here so the handler is only
 * concerned with rate limiting, dispatch, and envelope shaping.
 */
export async function parseImageUploadRequest(
  formData: FormData,
): Promise<
  { ok: true; value: ParsedImageUploadRequest } | { ok: false; error: ImageUploadRequestError }
> {
  const formParsed = validateFormData(formData);

  if (!formParsed.success) {
    return {
      ok: false,
      error: { message: 'Invalid form data', details: zodToFieldErrors(formParsed.error) },
    };
  }

  const imageFile = formData.get('image');

  if (!(imageFile instanceof File)) {
    return {
      ok: false,
      error: {
        message: 'image field must be a File',
        details: [{ field: 'image', message: 'File is required' }],
      },
    };
  }

  const fileParsed = validateFileMetadata(imageFile);

  if (!fileParsed.success) {
    return {
      ok: false,
      error: { message: 'Invalid image file', details: zodToFieldErrors(fileParsed.error) },
    };
  }

  return {
    ok: true,
    value: {
      sessionId: formParsed.data.sessionId,
      consentGiven: formParsed.data.consentGiven === 'true',
      fileBuffer: Buffer.from(await imageFile.arrayBuffer()),
      fileName: fileParsed.data.fileName,
      mimeType: fileParsed.data.mimeType,
      fileSize: fileParsed.data.fileSize,
    },
  };
}

/**
 * Helper to validate form data from a request.
 * Extracts and validates sessionId and consentGiven fields.
 *
 * @param formData - The FormData object from the request
 * @returns Parsed and validated form fields
 */
export function validateFormData(
  formData: FormData,
): z.SafeParseReturnType<unknown, ImageUploadFormData> {
  const raw = {
    sessionId: formData.get('sessionId'),
    consentGiven: formData.get('consentGiven'),
  };

  return imageUploadFormSchema.safeParse(raw);
}

/**
 * Helper to validate image file metadata.
 *
 * @param file - The File object from FormData
 * @returns Parsed and validated file metadata
 */
export function validateFileMetadata(
  file: File,
): z.SafeParseReturnType<unknown, ImageFileMetadata> {
  const metadata = {
    mimeType: file.type,
    fileSize: file.size,
    fileName: file.name,
  };

  return imageFileMetadataSchema.safeParse(metadata);
}
