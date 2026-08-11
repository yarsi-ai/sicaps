import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { ForbiddenError, NotFoundError } from '@/lib/errors';

vi.mock('@/services/testing.service', () => ({
  getSessionScoring: vi.fn(),
}));

import { getSessionScoring } from '@/services/testing.service';
import { GET } from './route';

const mockGetSessionScoring = vi.mocked(getSessionScoring);

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function createRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/test/session/${id}/scoring`, {
    method: 'GET',
  });
}

function callGET(id: string) {
  return GET(createRequest(id), { params: Promise.resolve({ id }) });
}

const MOCK_RESPONSE = {
  session: {
    id: VALID_UUID,
    source: 'testing',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    demographics: {
      id: 'demo-1',
      sessionId: VALID_UUID,
      age: 16,
      gender: 'male',
      educationLevel: 'JUNIOR_HIGH',
      name: null,
      createdAt: new Date(),
    },
    status: 'COMPLETED',
    mode: 'ai',
    completedAt: new Date('2025-01-15T10:30:00Z'),
    metadata: { offTopicCount: 1, shortAnswerCount: 2 },
    perception: 'ADEQUATE',
    scores: { intensitas: 3, waktu: 2 },
    output: {
      conclusion: 'Berdasarkan gejala...',
      perceptionResponse: 'Pengguna menunjukkan...',
      recommendation: 'Disarankan...',
      suggestion: 'Menjaga...',
    },
  },
  turns: [
    {
      turnNumber: 1,
      log: {
        id: 'log-1',
        turnNumber: 1,
        userMessage: 'saya gatal',
        rawResponse: '{}',
        parseStatus: 'SUCCESS',
        parseError: null,
        systemMessage: '',
        model: 'llama',
        promptVersion: 'v1',
        latencyMs: 100,
        tokenUsage: null,
        retryCount: 0,
      },
      extraction: {
        extraction: { intensitas: [{ keyword: 'gatal', confidence: 0.9 }] },
        scores: { intensitas: { score: 3 } },
      },
      feedback: { isAccurate: true, notes: null },
    },
  ],
  scoring: {
    totalScore: 12,
    riskLevel: 'MODERATE',
    categoriesCovered: ['intensitas', 'waktu'],
    categoriesRemaining: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
  },
};

describe('GET /api/test/session/[id]/scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid UUID param', async () => {
    const response = await callGET('not-a-uuid');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Invalid session ID');
    expect(mockGetSessionScoring).not.toHaveBeenCalled();
  });

  it('returns 200 with data for valid session', async () => {
    mockGetSessionScoring.mockResolvedValue(MOCK_RESPONSE as never);

    const response = await callGET(VALID_UUID);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.session.id).toBe(VALID_UUID);
    expect(json.data.scoring.totalScore).toBe(12);
    expect(json.data.turns).toHaveLength(1);
    expect(json.error).toBeNull();
    expect(mockGetSessionScoring).toHaveBeenCalledWith(VALID_UUID);
  });

  it('returns 404 when service throws NotFoundError', async () => {
    mockGetSessionScoring.mockRejectedValue(new NotFoundError('Session not found'));

    const response = await callGET(VALID_UUID);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.data).toBeNull();
  });

  it('returns 403 when service throws ForbiddenError', async () => {
    mockGetSessionScoring.mockRejectedValue(
      new ForbiddenError('Cannot access production session via test API'),
    );

    const response = await callGET(VALID_UUID);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toBe('Cannot access production session via test API');
    expect(json.data).toBeNull();
  });

  it('rethrows unexpected errors', async () => {
    mockGetSessionScoring.mockRejectedValue(new Error('DB connection lost'));

    await expect(callGET(VALID_UUID)).rejects.toThrow('DB connection lost');
  });
});
