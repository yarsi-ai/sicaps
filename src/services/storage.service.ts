import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';

/**
 * Error thrown when storage operations fail.
 */
export class StorageError extends AppError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message, 500, 'STORAGE_ERROR');
  }
}

/** Private bucket name for screening images */
const SCREENING_IMAGES_BUCKET = 'screening-images';

/**
 * Whether Supabase Storage is configured for this deployment.
 *
 * Both vars are optional in the env schema (storage is not required to run
 * v2 — only the vision API is), so callers that want to upload must check
 * this first rather than let `uploadScreeningImage` throw. Kept separate from
 * `getSupabaseClient`'s own check so a caller can decide to skip storage
 * entirely instead of treating a missing config as a hard failure.
 */
export function isStorageConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Singleton Supabase client for storage operations */
let _supabaseClient: SupabaseClient | undefined;

/**
 * Get or create the Supabase client singleton.
 * Uses service role key for server-side operations (bypasses RLS).
 */
function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const env = getEnv();
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new StorageError(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage operations',
      );
    }

    _supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabaseClient;
}

/**
 * Result of uploading a screening image to Supabase Storage.
 */
export interface UploadImageResult {
  /** Storage path of the uploaded image (e.g., "session-id/1234567890.jpg") */
  storagePath: string;
}

/**
 * Derive file extension from MIME type.
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  return mimeToExt[mimeType] ?? 'bin';
}

/**
 * Upload a screening image to Supabase Storage.
 *
 * @param sessionId - The screening session ID (used as folder path)
 * @param fileBuffer - The image file content as a Buffer
 * @param mimeType - The MIME type of the image (e.g., "image/jpeg")
 * @param extension - Optional file extension override (derived from mimeType if not provided)
 * @returns Object containing the storage path
 * @throws StorageError if the upload fails
 */
export async function uploadScreeningImage(
  sessionId: string,
  fileBuffer: Buffer,
  mimeType: string,
  extension?: string,
): Promise<UploadImageResult> {
  const client = getSupabaseClient();

  // Generate storage path: {sessionId}/{timestamp}.{ext}
  const timestamp = Date.now();
  const ext = extension ?? getExtensionFromMimeType(mimeType);
  const storagePath = `${sessionId}/${timestamp}.${ext}`;

  // Upload to Supabase Storage
  const { error } = await client.storage
    .from(SCREENING_IMAGES_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false, // Don't overwrite if exists (shouldn't happen with timestamp)
    });

  if (error) {
    throw new StorageError(`Failed to upload image: ${error.message}`, error);
  }

  return { storagePath };
}

/**
 * Generate a signed URL for accessing a private screening image.
 *
 * @param storagePath - The storage path of the image
 * @param expiresInSeconds - URL validity period, defaults to CONFIG.visualDetection.SIGNED_URL_TTL_SECONDS
 * @returns The signed URL for accessing the image
 * @throws StorageError if URL generation fails
 */
export async function getSignedImageUrl(
  storagePath: string,
  expiresInSeconds: number = CONFIG.visualDetection.SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage
    .from(SCREENING_IMAGES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new StorageError(
      `Failed to generate signed URL: ${error?.message ?? 'Unknown error'}`,
      error,
    );
  }

  return data.signedUrl;
}

/**
 * Delete a screening image from Supabase Storage.
 *
 * @param storagePath - The storage path of the image to delete
 * @throws StorageError if deletion fails
 */
export async function deleteScreeningImage(storagePath: string): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.storage.from(SCREENING_IMAGES_BUCKET).remove([storagePath]);

  if (error) {
    throw new StorageError(`Failed to delete image: ${error.message}`, error);
  }
}

/**
 * Reset the Supabase client singleton. Exists so tests can swap the mocked
 * client between cases; nothing in production should call it.
 */
export function resetSupabaseClientForTests(): void {
  _supabaseClient = undefined;
}
