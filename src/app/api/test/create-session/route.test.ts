import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/db/prisma';
import { POST } from './route';

const mockCreate = vi.mocked(prisma.screeningSession.create);

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test/create-session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_BODY = {
  age: 16,
  gender: 'male',
  educationLevel: 'JUNIOR_HIGH',
  locale: 'id',
};

describe('POST /api/test/create-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a testing session and returns sessionId', async () => {
    mockCreate.mockResolvedValue({
      id: 'session-123',
      source: 'testing',
    } as never);

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ sessionId: 'session-123', source: 'testing' });
    expect(json.error).toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        source: 'testing',
        locale: 'id',
        demographics: {
          create: { age: 16, gender: 'male', educationLevel: 'JUNIOR_HIGH' },
        },
      },
    });
  });

  it('defaults locale to id when not provided', async () => {
    mockCreate.mockResolvedValue({ id: 'session-456', source: 'testing' } as never);

    const body = { age: 12, gender: 'female', educationLevel: 'ELEMENTARY' };
    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.sessionId).toBe('session-456');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locale: 'id' }),
      }),
    );
  });

  it('returns 400 when age is below minimum', async () => {
    const body = { ...VALID_BODY, age: 3 };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.data).toBeNull();
  });

  it('returns 400 when age is above maximum', async () => {
    const body = { ...VALID_BODY, age: 150 };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when gender is invalid', async () => {
    const body = { ...VALID_BODY, gender: 'other' };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when educationLevel is empty', async () => {
    const body = { ...VALID_BODY, educationLevel: '' };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when locale is unsupported', async () => {
    const body = { ...VALID_BODY, locale: 'fr' };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when age is a float', async () => {
    const body = { ...VALID_BODY, age: 12.5 };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
