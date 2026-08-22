import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/services/visual-detection.service', () => ({
  submitImage: vi.fn(),
  ConsentRequiredError: class ConsentRequiredError extends Error {
    statusCode = 400;
    code = 'CONSENT_REQUIRED';
    constructor(message = 'Image consent is required') {
      super(message);
      this.name = 'ConsentRequiredError';
    }
  },
}));

vi.mock('@/lib/rate-limiter', () => ({
  safeCheckRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

import { POST } from './route';
import { submitImage } from '@/services/visual-detection.service';
import { safeCheckRateLimit, getRateLimitHeaders } from '@/lib/rate-limiter';
import { CONFIG } from '@/lib/config';
import { NotFoundError } from '@/lib/errors';

const mockSubmitImage = vi.mocked(submitImage);
const mockSafeCheckRateLimit = vi.mocked(safeCheckRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Create a mock File object that implements all methods needed by the route.
 * This uses a proper class that extends the built-in File functionality.
 */
function createTestFile(content: Uint8Array, name: string, type: string): File {
  // Create a file object with all required properties and methods
  const mockFile = {
    name,
    type,
    size: content.length,
    lastModified: Date.now(),
    webkitRelativePath: '',
    arrayBuffer: async () =>
      content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      ) as ArrayBuffer,
    slice: () => new Blob([content as BlobPart], { type }),
    stream: () => new ReadableStream(),
    text: async () => new TextDecoder().decode(content),
  };

  // Make it pass `instanceof File` check
  Object.setPrototypeOf(mockFile, File.prototype);

  return mockFile as unknown as File;
}

/**
 * Create a mock NextRequest with a mocked formData() method.
 */
function createMockRequest(formDataValues: {
  sessionId?: string | null;
  consentGiven?: string | null;
  image?: File | null;
}): NextRequest {
  const mockFormData = {
    get: (key: string) => {
      if (key === 'sessionId') return formDataValues.sessionId ?? null;
      if (key === 'consentGiven') return formDataValues.consentGiven ?? null;
      if (key === 'image') return formDataValues.image ?? null;
      return null;
    },
  } as unknown as FormData;

  const request = new NextRequest('http://localhost:3000/api/screening/image', {
    method: 'POST',
  });

  // Mock the formData method
  vi.spyOn(request, 'formData').mockResolvedValue(mockFormData);

  return request;
}

describe('POST /api/screening/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 4,
      limit: 5,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfterSeconds: null,
    });
    mockGetRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '4',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    mockSubmitImage.mockResolvedValue({
      imageId: 'image-id-123',
      botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
      followUpMessage: 'Nah menurut kamu, keluhan gatal ini seberapa berat?',
      phase: 'ASKING_PERCEPTION',
      visualResult: 'POSITIVE',
      predictionFailed: false,
      finalOutput: 'SUSPECTED_SCABIES',
    });
  });

  // ---------------------------------------------------------------------------
  // Happy Path
  // ---------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns 201 with imageId on valid request', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      // The response carries the resolved gate state, so the client needs no
      // follow-up poll to know whether it can open the result page.
      expect(body.data).toEqual({
        imageId: 'image-id-123',
        botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
        // The upload is not a chat turn, so the phase it lands in has no other
        // way to ask its question — the response carries it.
        followUpMessage: 'Nah menurut kamu, keluhan gatal ini seberapa berat?',
        phase: 'ASKING_PERCEPTION',
        visualResult: 'POSITIVE',
        predictionFailed: false,
        finalOutput: 'SUSPECTED_SCABIES',
      });
      expect(body.error).toBeNull();
      expect(body.meta).toBeDefined();
      expect(body.meta.requestId).toBeDefined();
    });

    it('calls submitImage with correct parameters', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'photo.png', 'image/png');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      await POST(request);

      expect(mockSubmitImage).toHaveBeenCalledWith({
        sessionId: VALID_SESSION_ID,
        fileBuffer: expect.any(Buffer),
        fileName: 'photo.png',
        mimeType: 'image/png',
        fileSize: imageContent.length,
        consentGiven: true,
      });
    });

    it('accepts image/webp MIME type', async () => {
      const imageContent = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF header
      const imageFile = createTestFile(imageContent, 'test.webp', 'image/webp');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation Rejections
  // ---------------------------------------------------------------------------

  describe('validation rejections', () => {
    it('returns 400 when image file is missing', async () => {
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: null,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('image field must be a File');
    });

    it('returns 400 when sessionId is not a valid UUID', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: 'not-a-uuid',
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'sessionId' })]),
      );
    });

    it('returns 400 when sessionId is missing', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: null,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when consentGiven is not "true"', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'false',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'consentGiven',
            message: expect.stringContaining('true'),
          }),
        ]),
      );
    });

    it('returns 400 when consentGiven is missing', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: null,
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts image/gif files', async () => {
      const imageContent = new Uint8Array([0x47, 0x49, 0x46, 0x38]); // GIF header
      const imageFile = createTestFile(imageContent, 'test.gif', 'image/gif');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it('accepts image/bmp files', async () => {
      const imageContent = new Uint8Array([0x42, 0x4d]);
      const imageFile = createTestFile(imageContent, 'test.bmp', 'image/bmp');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it('returns 400 when MIME type is not an image (application/pdf)', async () => {
      const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // PDF header %PDF
      const pdfFile = createTestFile(content, 'test.pdf', 'application/pdf');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: pdfFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'mimeType',
            message: expect.stringContaining('MIME type'),
          }),
        ]),
      );
    });

    it('returns 400 when file exceeds 10MB size limit', async () => {
      // Create a mock file with overridden size
      const smallContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const oversizedFile = {
        name: 'large.jpg',
        type: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte (override size)
        lastModified: Date.now(),
        webkitRelativePath: '',
        arrayBuffer: async () => smallContent.buffer.slice(0) as ArrayBuffer,
        slice: () => new Blob([smallContent], { type: 'image/jpeg' }),
        stream: () => new ReadableStream(),
        text: async () => '',
      };
      Object.setPrototypeOf(oversizedFile, File.prototype);

      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: oversizedFile as unknown as File,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'fileSize',
            message: expect.stringContaining('10MB'),
          }),
        ]),
      );
    });

    it('returns 400 when file has zero size', async () => {
      const emptyContent = new Uint8Array(0);
      const imageFile = createTestFile(emptyContent, 'empty.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'fileSize',
            message: expect.stringContaining('greater than 0'),
          }),
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockSafeCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        limit: 5,
        resetAt: Math.floor(Date.now() / 1000) + 45,
        retryAfterSeconds: 45,
      });
      mockGetRateLimitHeaders.mockReturnValue({
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 45),
      });

      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(response.headers.get('Retry-After')).toBe('45');
    });

    it('includes X-RateLimit-* headers on success', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('4');
    });

    it('uses sessionId as rate limit key', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      await POST(request);

      // Asserts the wiring — that the session is the bucket — by reading the
      // config rather than restating it. The threshold itself is a tunable, and
      // duplicating it here only meant this test failed when it was tuned.
      expect(mockSafeCheckRateLimit).toHaveBeenCalledWith(VALID_SESSION_ID, CONFIG.rateLimit.image);
    });
  });

  // ---------------------------------------------------------------------------
  // Service Errors
  // ---------------------------------------------------------------------------

  describe('service errors', () => {
    it('returns 400 when ConsentRequiredError is thrown', async () => {
      // Import the real ConsentRequiredError from the service module to ensure
      // it properly extends AppError
      const { ConsentRequiredError: RealConsentRequiredError } = await vi.importActual<
        typeof import('@/services/visual-detection.service')
      >('@/services/visual-detection.service');

      mockSubmitImage.mockRejectedValue(new RealConsentRequiredError());

      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('returns 404 when NotFoundError is thrown', async () => {
      mockSubmitImage.mockRejectedValue(new NotFoundError('Session not found'));

      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 500 on unexpected errors', async () => {
      mockSubmitImage.mockRejectedValue(new Error('Database connection failed'));

      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
    });
  });

  // ---------------------------------------------------------------------------
  // Response Metadata
  // ---------------------------------------------------------------------------

  describe('response metadata', () => {
    it('includes requestId in response meta', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(body.meta.requestId).toBeDefined();
      expect(typeof body.meta.requestId).toBe('string');
      expect(body.meta.requestId.length).toBeGreaterThan(0);
    });

    it('includes timestamp in response meta', async () => {
      const imageContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const imageFile = createTestFile(imageContent, 'test.jpg', 'image/jpeg');
      const request = createMockRequest({
        sessionId: VALID_SESSION_ID,
        consentGiven: 'true',
        image: imageFile,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(body.meta.timestamp).toBeDefined();
      expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
    });
  });
});
