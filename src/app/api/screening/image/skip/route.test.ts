/**
 * Tests for POST /api/screening/image/skip
 *
 * Advances the session out of AWAITING_IMAGE without a photo, called after
 * the client exhausts CONFIG.visualDetection.MAX_UPLOAD_FAILURES attempts.
 *
 * Requirements: 2.1
 */
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/features/screening-chat-v2', () => ({
  advancePhaseAfterImage: vi.fn(),
}));

import { POST } from './route';
import { advancePhaseAfterImage } from '@/features/screening-chat-v2';
import { NotFoundError } from '@/lib/errors';

const mockAdvance = vi.mocked(advancePhaseAfterImage);
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/screening/image/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/screening/image/skip', () => {
  describe('happy path', () => {
    it('returns 200 with the new phase and follow-up question', async () => {
      mockAdvance.mockResolvedValue({
        phase: 'ASKING_PERCEPTION',
        followUpMessage: 'Menurut kamu seberapa berat?',
      });

      const response = await POST(makeRequest({ sessionId: VALID_SESSION_ID }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        phase: 'ASKING_PERCEPTION',
        followUpMessage: 'Menurut kamu seberapa berat?',
      });
      expect(body.error).toBeNull();
    });

    it('calls advancePhaseAfterImage with the provided sessionId', async () => {
      mockAdvance.mockResolvedValue({ phase: 'ASKING_PERCEPTION', followUpMessage: null });

      await POST(makeRequest({ sessionId: VALID_SESSION_ID }));

      expect(mockAdvance).toHaveBeenCalledWith(VALID_SESSION_ID);
    });

    it('carries a null followUpMessage when the phase owes no question', async () => {
      mockAdvance.mockResolvedValue({ phase: 'SCREENING_COMPLETE', followUpMessage: null });

      const response = await POST(makeRequest({ sessionId: VALID_SESSION_ID }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.followUpMessage).toBeNull();
    });
  });

  describe('validation', () => {
    it('returns 400 when sessionId is missing', async () => {
      const response = await POST(makeRequest({}));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(mockAdvance).not.toHaveBeenCalled();
    });

    it('returns 400 when sessionId is not a valid UUID', async () => {
      const response = await POST(makeRequest({ sessionId: 'not-a-uuid' }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(mockAdvance).not.toHaveBeenCalled();
    });

    it('returns 400 when body is not valid JSON', async () => {
      const request = new NextRequest('http://localhost/api/screening/image/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('service errors', () => {
    it('returns 404 when the session does not exist', async () => {
      mockAdvance.mockRejectedValue(new NotFoundError('Session not found'));

      const response = await POST(makeRequest({ sessionId: VALID_SESSION_ID }));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 500 on unexpected errors', async () => {
      mockAdvance.mockRejectedValue(new Error('Database connection lost'));

      const response = await POST(makeRequest({ sessionId: VALID_SESSION_ID }));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
