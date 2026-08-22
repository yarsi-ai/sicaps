/**
 * Unit tests for predictVisual() with mocked fetch.
 *
 * Tests request shape (headers, body, timeout), successful response mapping,
 * and that network errors/non-2xx raise VisionPredictionError.
 *
 * Requirements: 6.1, 6.2, 6.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { predictVisual, VisionPredictionError } from './vision-api.service';

// Mock the env module
vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(),
}));

import { getEnv } from '@/lib/env';

const mockGetEnv = vi.mocked(getEnv);

// Store the original fetch
const originalFetch = global.fetch;

describe('predictVisual', () => {
  const mockEnv = {
    VISION_MODEL_URL: 'https://vision-api.example.com/predict',
    VISION_MODEL_API_KEY: 'test-api-key-12345',
    VISION_TIMEOUT_MS: 12000,
  };

  const testImageBuffer = Buffer.from('fake-image-data');
  const testMimeType = 'image/jpeg';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetEnv.mockReturnValue(mockEnv as ReturnType<typeof getEnv>);
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe('request shape', () => {
    it('sends POST request to VISION_MODEL_URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, prediction: 'Not Scabies', confidence: 86.96 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      expect(mockFetch).toHaveBeenCalledWith(
        mockEnv.VISION_MODEL_URL,
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('includes Authorization header with Bearer token when an API key is configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, prediction: 'Not Scabies', confidence: 86.96 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: `Bearer ${mockEnv.VISION_MODEL_API_KEY}` },
        }),
      );
    });

    it('omits the headers object entirely when no API key is configured', async () => {
      mockGetEnv.mockReturnValue({
        ...mockEnv,
        VISION_MODEL_API_KEY: undefined,
      } as unknown as ReturnType<typeof getEnv>);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: undefined }),
      );
    });

    it('does not set Content-Type manually, so fetch derives the multipart boundary', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, 'image/png');

      const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['Content-Type']).toBeUndefined();
    });

    it('sends the image as a multipart/form-data body under a "file" field', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      const requestBody = mockFetch.mock.calls[0]?.[1]?.body;
      expect(requestBody).toBeInstanceOf(FormData);

      const file = (requestBody as FormData).get('file');
      expect(file).toBeInstanceOf(Blob);
      // JPEG must send as photo.jpg, not photo.jpeg — the external API reads the
      // file type from the filename extension and does not recognise .jpeg.
      expect((file as File).name).toBe('photo.jpg');
    });

    it('uses photo.png as the filename for PNG images', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Not Scabies', confidence: 87.0 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, 'image/png');

      const requestBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      const file = requestBody.get('file') as File;
      expect(file.name).toBe('photo.png');
    });

    it('uses photo.heic as the filename for HEIC images', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Not Scabies', confidence: 88.0 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, 'image/heic');

      const requestBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      expect((requestBody.get('file') as File).name).toBe('photo.heic');
    });

    it('uses photo.webp as the filename for WebP images', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Not Scabies', confidence: 90.0 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, 'image/webp');

      const requestBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      const file = requestBody.get('file') as File;
      expect(file.name).toBe('photo.webp');
    });

    it('preserves the image bytes inside the multipart part', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      const requestBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      const file = requestBody.get('file') as Blob;

      // jsdom's Blob implements none of text()/arrayBuffer()/stream(), so the
      // byte content cannot be read back here. Size is the closest verifiable
      // proxy that the whole buffer was attached rather than a slice of it.
      expect(file.size).toBe(testImageBuffer.byteLength);
    });

    it('includes AbortSignal for timeout handling', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });
      global.fetch = mockFetch;

      await predictVisual(testImageBuffer, testMimeType);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe('successful response mapping', () => {
    it('maps prediction "Scabies" to POSITIVE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            prediction: 'Scabies',
            confidence: 59.14,
            details: { scabies: 59.14, not_scabies: 40.86 },
          }),
      });

      const result = await predictVisual(testImageBuffer, testMimeType);

      expect(result).toEqual({
        result: 'POSITIVE',
        confidence: 59.14,
        rawResult: { scabies: 59.14, not_scabies: 40.86 },
      });
    });

    it('maps prediction "Not Scabies" to NEGATIVE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            prediction: 'Not Scabies',
            confidence: 86.96,
            details: { scabies: 13.04, not_scabies: 86.96 },
          }),
      });

      const result = await predictVisual(testImageBuffer, testMimeType);

      expect(result).toEqual({
        result: 'NEGATIVE',
        confidence: 86.96,
        rawResult: { scabies: 13.04, not_scabies: 86.96 },
      });
    });

    it('omits rawResult when details is absent from the response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });

      const result = await predictVisual(testImageBuffer, testMimeType);

      expect(result).toEqual({ result: 'POSITIVE', confidence: 59.14 });
      expect(result.rawResult).toBeUndefined();
    });

    it('treats success: false as a failed prediction, not a valid NEGATIVE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, prediction: 'Not Scabies', confidence: 50 }),
      });

      await expect(predictVisual(testImageBuffer, testMimeType)).rejects.toThrow(
        VisionPredictionError,
      );
    });
  });

  describe('non-2xx response handling', () => {
    it('throws VisionPredictionError with code NON_2XX_RESPONSE on 400', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(predictVisual(testImageBuffer, testMimeType)).rejects.toThrow(
        VisionPredictionError,
      );

      try {
        await predictVisual(testImageBuffer, testMimeType);
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NON_2XX_RESPONSE');
        expect((error as VisionPredictionError).upstreamStatus).toBe(400);
      }
    });

    it('throws VisionPredictionError with code NON_2XX_RESPONSE on 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NON_2XX_RESPONSE');
        expect((error as VisionPredictionError).upstreamStatus).toBe(401);
      }
    });

    it('throws VisionPredictionError with code NON_2XX_RESPONSE on 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NON_2XX_RESPONSE');
        expect((error as VisionPredictionError).upstreamStatus).toBe(500);
      }
    });

    it('throws VisionPredictionError with code NON_2XX_RESPONSE on 503', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NON_2XX_RESPONSE');
        expect((error as VisionPredictionError).upstreamStatus).toBe(503);
      }
    });

    it('includes raw response body in error when available', async () => {
      const errorBody = 'Invalid image format';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(errorBody),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).rawResponse).toBe(errorBody);
      }
    });
  });

  describe('network error handling', () => {
    it('throws VisionPredictionError with code NETWORK_ERROR on fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network request failed'));

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NETWORK_ERROR');
        expect((error as VisionPredictionError).message).toContain('Network request failed');
      }
    });

    it('throws VisionPredictionError with code NETWORK_ERROR on DNS failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NETWORK_ERROR');
      }
    });

    it('throws VisionPredictionError with code NETWORK_ERROR on connection refused', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('timeout handling', () => {
    it('throws VisionPredictionError with reason TIMEOUT when the request is aborted', async () => {
      // The AbortController wiring cannot be driven end to end under fake
      // timers, so the abort is injected at the point where it surfaces: fetch
      // rejecting with an AbortError.
      global.fetch = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
        );

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('TIMEOUT');
        expect((error as VisionPredictionError).message).toContain('timed out');
      }
    });

    it('uses VISION_TIMEOUT_MS from env for timeout duration', async () => {
      const customTimeout = 5000;
      mockGetEnv.mockReturnValue({
        ...mockEnv,
        VISION_TIMEOUT_MS: customTimeout,
      } as ReturnType<typeof getEnv>);

      // Mock AbortError to test timeout path
      global.fetch = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
        );

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('TIMEOUT');
        expect((error as VisionPredictionError).message).toContain(String(customTimeout));
      }
    });
  });

  describe('schema validation failures', () => {
    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED for invalid JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
        expect((error as VisionPredictionError).message).toContain('invalid JSON');
      }
    });

    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED when prediction is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, confidence: 85 }), // missing prediction
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED when prediction is invalid enum', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        // not "Scabies" or "Not Scabies"
        json: () => Promise.resolve({ success: true, prediction: 'Maybe', confidence: 50 }),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED when confidence is out of bounds (negative)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: -5 }),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED when confidence exceeds 100', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 150 }),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('throws VisionPredictionError with code SCHEMA_VALIDATION_FAILED when success is false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, prediction: 'Not Scabies', confidence: 50 }),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('SCHEMA_VALIDATION_FAILED');
        expect((error as VisionPredictionError).message).toContain('unsuccessful');
      }
    });

    it('includes raw response in error when schema validation fails', async () => {
      const invalidResponse = { success: true, prediction: 'Invalid', extra: 'data' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(invalidResponse),
      });

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).rawResponse).toEqual(invalidResponse);
      }
    });
  });

  describe('missing configuration handling', () => {
    it('throws VisionPredictionError with reason CONFIG_MISSING when VISION_MODEL_URL is missing', async () => {
      mockGetEnv.mockReturnValue({
        ...mockEnv,
        VISION_MODEL_URL: undefined,
      } as unknown as ReturnType<typeof getEnv>);

      try {
        await predictVisual(testImageBuffer, testMimeType);
        expect.fail('Expected VisionPredictionError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VisionPredictionError);
        expect((error as VisionPredictionError).reason).toBe('CONFIG_MISSING');
        expect((error as VisionPredictionError).message).toContain('configuration');
      }
    });

    it('succeeds without VISION_MODEL_API_KEY, since the configured endpoint does not require one', async () => {
      mockGetEnv.mockReturnValue({
        ...mockEnv,
        VISION_MODEL_API_KEY: undefined,
      } as unknown as ReturnType<typeof getEnv>);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, prediction: 'Scabies', confidence: 59.14 }),
      });

      await expect(predictVisual(testImageBuffer, testMimeType)).resolves.toEqual({
        result: 'POSITIVE',
        confidence: 59.14,
      });
    });
  });
});
