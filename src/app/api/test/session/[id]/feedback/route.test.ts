import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      findUnique: vi.fn(),
    },
    evaluationFeedback: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@/db/prisma';
import { POST } from './route';

const mockFindUnique = vi.mocked(prisma.screeningSession.findUnique);
const mockUpsert = vi.mocked(prisma.evaluationFeedback.upsert);

function createRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/test/session/${id}/feedback`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function callPOST(id: string, body: unknown) {
  return POST(createRequest(id, body), { params: Promise.resolve({ id }) });
}

const VALID_BODY = {
  turnNumber: 1,
  evaluatorType: 'DEVELOPER',
  isAccurate: true,
  notes: 'Extraction looks correct',
};

const MOCK_SESSION = {
  id: 'session-abc',
  promptVersion: 'v1',
  source: 'testing',
};

describe('POST /api/test/session/[id]/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates feedback and returns success response', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);
    mockUpsert.mockResolvedValue({
      id: 'fb-1',
      isAccurate: true,
      turnNumber: 1,
    } as never);

    const response = await callPOST('session-abc', VALID_BODY);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ id: 'fb-1', isAccurate: true, turnNumber: 1 });
    expect(json.error).toBeNull();
  });

  it('upserts with correct prisma params', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);
    mockUpsert.mockResolvedValue({ id: 'fb-1', isAccurate: true, turnNumber: 1 } as never);

    await callPOST('session-abc', VALID_BODY);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        sessionId_turnNumber_evaluatorType: {
          sessionId: 'session-abc',
          turnNumber: 1,
          evaluatorType: 'DEVELOPER',
        },
      },
      create: {
        sessionId: 'session-abc',
        turnNumber: 1,
        evaluatorType: 'DEVELOPER',
        isAccurate: true,
        notes: 'Extraction looks correct',
        promptVersion: 'v1',
      },
      update: {
        isAccurate: true,
        notes: 'Extraction looks correct',
      },
    });
  });

  it('handles feedback without notes (optional field)', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);
    mockUpsert.mockResolvedValue({ id: 'fb-2', isAccurate: false, turnNumber: 2 } as never);

    const body = { turnNumber: 2, evaluatorType: 'DOCTOR', isAccurate: false };
    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.isAccurate).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ notes: null }),
        update: expect.objectContaining({ notes: null }),
      }),
    );
  });

  it('returns 404 when session does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const response = await callPOST('nonexistent-id', VALID_BODY);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('Session not found');
    expect(json.data).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 when turnNumber is missing', async () => {
    const body = { evaluatorType: 'DEVELOPER', isAccurate: true };

    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.data).toBeNull();
  });

  it('returns 400 when turnNumber is zero', async () => {
    const body = { ...VALID_BODY, turnNumber: 0 };

    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when turnNumber is a float', async () => {
    const body = { ...VALID_BODY, turnNumber: 1.5 };

    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when evaluatorType is invalid', async () => {
    const body = { ...VALID_BODY, evaluatorType: 'ADMIN' };

    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when isAccurate is not a boolean', async () => {
    const body = { ...VALID_BODY, isAccurate: 'yes' };

    const response = await callPOST('session-abc', body);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts all valid evaluator types', async () => {
    mockFindUnique.mockResolvedValue(MOCK_SESSION as never);
    mockUpsert.mockResolvedValue({ id: 'fb-3', isAccurate: true, turnNumber: 1 } as never);

    for (const evaluatorType of ['DEVELOPER', 'DOCTOR', 'RESEARCHER']) {
      const body = { ...VALID_BODY, evaluatorType };
      const response = await callPOST('session-abc', body);
      expect(response.status).toBe(200);
    }
  });
});
