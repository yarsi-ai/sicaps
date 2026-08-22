/**
 * External vision API client.
 *
 * Lives in `services/` rather than `lib/` because it performs network I/O,
 * which `lib/` forbids (CODING_STANDARDS §3.3). The response contract and its
 * parsing stay pure in `lib/vision/vision-response.ts`.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 13.2
 */

import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { parseVisionResponse, type VisionPredictionResult } from '@/lib/vision';

/** Why a prediction attempt failed. The retry loop treats all reasons alike. */
export type VisionFailureReason =
  | 'CONFIG_MISSING'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NON_2XX_RESPONSE'
  | 'SCHEMA_VALIDATION_FAILED';

/**
 * Thrown by predictVisual() on missing configuration, network failure, timeout,
 * non-2xx response, or schema validation failure. The service layer decides
 * whether to retry; it never reaches the client, because the retry loop
 * converts exhaustion into the documented NEGATIVE fallback.
 */
export class VisionPredictionError extends AppError {
  constructor(
    message: string,
    public readonly reason: VisionFailureReason,
    public readonly upstreamStatus?: number,
    public readonly rawResponse?: unknown,
  ) {
    super(message, 503, 'VISION_UNAVAILABLE');
  }
}

/**
 * Derive a filename for the multipart part.
 *
 * The external API reads the file type from the `filename` parameter on the
 * multipart part, not from the part's Content-Type header. Two consequences:
 *
 * - JPEG must use the `.jpg` extension, not `.jpeg`. Splitting `image/jpeg`
 *   on `/` produces `jpeg`, which the API does not recognise.
 * - Every other supported MIME type happens to produce a correct extension
 *   (`png`, `webp`), but an explicit map is safer than relying on that.
 */
function filenameForMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  return `photo.${mimeToExt[mimeType] ?? mimeType.split('/')[1] ?? 'bin'}`;
}

/**
 * Send image bytes to the external visual prediction API and return a validated
 * result. Throws VisionPredictionError on any failure so the caller's retry
 * loop can treat every failure mode uniformly.
 */
export async function predictVisual(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<VisionPredictionResult> {
  const env = getEnv();
  const { VISION_MODEL_URL: url, VISION_MODEL_API_KEY: apiKey, VISION_TIMEOUT_MS: timeoutMs } = env;

  // Validated at startup when SCREENING_CHAT_VERSION=v2, but the URL stays
  // optional in the schema for v1 deployments, so narrow it here. The API key
  // is genuinely optional — the configured vision endpoint does not require one.
  if (!url) {
    throw new VisionPredictionError(
      'Vision API configuration is missing (VISION_MODEL_URL)',
      'CONFIG_MISSING',
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // The endpoint expects multipart/form-data with the image under a `file`
    // field, not a raw binary body. `fetch` sets the correct
    // `Content-Type: multipart/form-data; boundary=...` header itself when
    // given a FormData body — do not set Content-Type manually.
    const formData = new FormData();
    formData.append(
      'file',
      // `Buffer` isn't in the DOM `BlobPart` type, though it is structurally a
      // Uint8Array at runtime — the same conversion predictVisual's old raw-body
      // path used before this endpoint's multipart contract replaced it.
      new Blob([new Uint8Array(imageBuffer)], { type: mimeType }),
      filenameForMimeType(mimeType),
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let rawResponse: unknown;
      try {
        rawResponse = await response.text();
      } catch {
        // Body unreadable — the status code is enough to classify the failure.
      }

      throw new VisionPredictionError(
        `Vision API returned non-2xx status: ${response.status}`,
        'NON_2XX_RESPONSE',
        response.status,
        rawResponse,
      );
    }

    let jsonResponse: unknown;
    try {
      jsonResponse = await response.json();
    } catch {
      throw new VisionPredictionError(
        'Vision API returned invalid JSON',
        'SCHEMA_VALIDATION_FAILED',
        response.status,
      );
    }

    const parsed = parseVisionResponse(jsonResponse);

    if (!parsed.ok) {
      throw new VisionPredictionError(
        `Vision API response failed schema validation: ${parsed.message}`,
        'SCHEMA_VALIDATION_FAILED',
        response.status,
        jsonResponse,
      );
    }

    return parsed.value;
  } catch (error) {
    if (error instanceof VisionPredictionError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new VisionPredictionError(
        `Vision API request timed out after ${timeoutMs}ms`,
        'TIMEOUT',
      );
    }

    throw new VisionPredictionError(
      error instanceof Error ? error.message : 'Unknown network error',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
