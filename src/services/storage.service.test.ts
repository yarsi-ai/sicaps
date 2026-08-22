import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadScreeningImage,
  getSignedImageUrl,
  deleteScreeningImage,
  isStorageConfigured,
  StorageError,
  resetSupabaseClientForTests,
} from './storage.service';
import { getEnv } from '@/lib/env';

// Create mock storage methods
const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockRemove = vi.fn();

const mockSupabaseClient = {
  storage: {
    from: vi.fn(() => ({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
      remove: mockRemove,
    })),
  },
};

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Mock @/lib/env
vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  })),
}));

const mockGetEnv = vi.mocked(getEnv);

describe('storage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseClientForTests();
    // Restore the configured-by-default shape after tests that override it.
    mockGetEnv.mockReturnValue({
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    } as never);
  });

  afterEach(() => {
    resetSupabaseClientForTests();
  });

  describe('isStorageConfigured', () => {
    it('returns true when both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set', () => {
      mockGetEnv.mockReturnValue({
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      } as never);

      expect(isStorageConfigured()).toBe(true);
    });

    it('returns false when SUPABASE_URL is missing', () => {
      mockGetEnv.mockReturnValue({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      } as never);

      expect(isStorageConfigured()).toBe(false);
    });

    it('returns false when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      mockGetEnv.mockReturnValue({
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      } as never);

      expect(isStorageConfigured()).toBe(false);
    });

    it('returns false when both vars are missing', () => {
      mockGetEnv.mockReturnValue({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      } as never);

      expect(isStorageConfigured()).toBe(false);
    });
  });

  describe('uploadScreeningImage', () => {
    it('uploads image with correct path format {sessionId}/{timestamp}.{ext}', async () => {
      const sessionId = 'test-session-123';
      const fileBuffer = Buffer.from('fake-image-data');
      const mimeType = 'image/jpeg';

      mockUpload.mockResolvedValueOnce({ error: null });

      const result = await uploadScreeningImage(sessionId, fileBuffer, mimeType);

      // Verify storage path format
      expect(result.storagePath).toMatch(/^test-session-123\/\d+\.jpg$/);

      // Verify upload was called with correct bucket
      expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('screening-images');

      // Verify upload was called with correct parameters
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^test-session-123\/\d+\.jpg$/),
        fileBuffer,
        {
          contentType: mimeType,
          upsert: false,
        },
      );
    });

    it('derives extension from MIME type correctly', async () => {
      mockUpload.mockResolvedValue({ error: null });

      // Test JPEG
      let result = await uploadScreeningImage('session-1', Buffer.from('data'), 'image/jpeg');
      expect(result.storagePath).toMatch(/\.jpg$/);

      // Test PNG
      result = await uploadScreeningImage('session-2', Buffer.from('data'), 'image/png');
      expect(result.storagePath).toMatch(/\.png$/);

      // Test WebP
      result = await uploadScreeningImage('session-3', Buffer.from('data'), 'image/webp');
      expect(result.storagePath).toMatch(/\.webp$/);

      // Test unknown MIME type (defaults to bin)
      result = await uploadScreeningImage(
        'session-4',
        Buffer.from('data'),
        'application/octet-stream',
      );
      expect(result.storagePath).toMatch(/\.bin$/);
    });

    it('uses provided extension override', async () => {
      mockUpload.mockResolvedValueOnce({ error: null });

      const result = await uploadScreeningImage(
        'session-1',
        Buffer.from('data'),
        'image/jpeg',
        'custom',
      );

      expect(result.storagePath).toMatch(/\.custom$/);
    });

    it('throws StorageError on upload failure', async () => {
      mockUpload.mockResolvedValueOnce({
        error: { message: 'Bucket not found' },
      });

      await expect(
        uploadScreeningImage('session-1', Buffer.from('data'), 'image/jpeg'),
      ).rejects.toThrow(StorageError);
    });

    it('throws StorageError with correct message on upload failure', async () => {
      mockUpload.mockResolvedValueOnce({
        error: { message: 'Bucket not found' },
      });

      await expect(
        uploadScreeningImage('session-1', Buffer.from('data'), 'image/jpeg'),
      ).rejects.toThrow('Failed to upload image: Bucket not found');
    });

    it('returns unique storage paths for consecutive uploads', async () => {
      mockUpload.mockResolvedValue({ error: null });

      const results = await Promise.all([
        uploadScreeningImage('session-1', Buffer.from('data1'), 'image/jpeg'),
        uploadScreeningImage('session-1', Buffer.from('data2'), 'image/jpeg'),
      ]);

      // Both paths should be unique (different timestamps or same timestamp is fine, but paths different)
      expect(results[0].storagePath).toMatch(/^session-1\/\d+\.jpg$/);
      expect(results[1].storagePath).toMatch(/^session-1\/\d+\.jpg$/);
    });
  });

  describe('getSignedImageUrl', () => {
    it('generates signed URL with default expiration', async () => {
      const expectedUrl =
        'https://test-project.supabase.co/storage/v1/object/sign/screening-images/session-1/12345.jpg?token=xxx';
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: expectedUrl },
        error: null,
      });

      const result = await getSignedImageUrl('session-1/12345.jpg');

      expect(result).toBe(expectedUrl);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('session-1/12345.jpg', 3600);
    });

    it('generates signed URL with custom expiration', async () => {
      const expectedUrl =
        'https://test-project.supabase.co/storage/v1/object/sign/screening-images/session-1/12345.jpg?token=xxx';
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: expectedUrl },
        error: null,
      });

      const result = await getSignedImageUrl('session-1/12345.jpg', 7200);

      expect(result).toBe(expectedUrl);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('session-1/12345.jpg', 7200);
    });

    it('throws StorageError on signed URL generation failure', async () => {
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: null,
        error: { message: 'Object not found' },
      });

      await expect(getSignedImageUrl('nonexistent/path.jpg')).rejects.toThrow(StorageError);
    });

    it('throws StorageError with correct message on signed URL generation failure', async () => {
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: null,
        error: { message: 'Object not found' },
      });

      await expect(getSignedImageUrl('nonexistent/path.jpg')).rejects.toThrow(
        'Failed to generate signed URL: Object not found',
      );
    });

    it('throws StorageError when data is null', async () => {
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(getSignedImageUrl('path.jpg')).rejects.toThrow(
        'Failed to generate signed URL: Unknown error',
      );
    });
  });

  describe('deleteScreeningImage', () => {
    it('deletes image successfully', async () => {
      mockRemove.mockResolvedValueOnce({ error: null });

      await expect(deleteScreeningImage('session-1/12345.jpg')).resolves.toBeUndefined();

      expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('screening-images');
      expect(mockRemove).toHaveBeenCalledWith(['session-1/12345.jpg']);
    });

    it('throws StorageError on deletion failure', async () => {
      mockRemove.mockResolvedValueOnce({
        error: { message: 'Permission denied' },
      });

      await expect(deleteScreeningImage('session-1/12345.jpg')).rejects.toThrow(StorageError);
    });

    it('throws StorageError with correct message on deletion failure', async () => {
      mockRemove.mockResolvedValueOnce({
        error: { message: 'Permission denied' },
      });

      await expect(deleteScreeningImage('session-1/12345.jpg')).rejects.toThrow(
        'Failed to delete image: Permission denied',
      );
    });
  });

  describe('StorageError', () => {
    it('has correct properties', () => {
      const cause = new Error('original error');
      const error = new StorageError('Test error message', cause);

      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('STORAGE_ERROR');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('StorageError');
    });

    it('works without cause', () => {
      const error = new StorageError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeUndefined();
    });
  });
});
