import { CONFIG } from '@/lib/config';

/**
 * Check if a MIME type is allowed for visual detection image uploads.
 *
 * Allowed types: image/jpeg, image/png, image/webp
 *
 * @param mimeType - The MIME type string to validate
 * @returns true if the MIME type is in the allowed list
 *
 * Validates: Requirements 4.4, 13.1
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return (CONFIG.visualDetection.ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if a file size is within the allowed limit for visual detection uploads.
 *
 * File must be greater than 0 bytes and at most 10MB (10,485,760 bytes).
 *
 * @param fileSize - The file size in bytes
 * @returns true if the file size is valid (> 0 and <= MAX_FILE_SIZE_BYTES)
 *
 * Validates: Requirements 4.5, 13.1
 */
export function isWithinSizeLimit(fileSize: number): boolean {
  return fileSize > 0 && fileSize <= CONFIG.visualDetection.MAX_FILE_SIZE_BYTES;
}
