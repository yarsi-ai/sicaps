import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/features/screening-chat-v1/internal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/screening-chat-v1/internal')>();
  return {
    ...actual,
    buildSystemMessage: vi.fn(() => 'mocked-system-prompt-content'),
  };
});

import { buildSystemMessage } from '@/features/screening-chat-v1/internal';
import { POST } from './route';

const mockBuildSystemMessage = vi.mocked(buildSystemMessage);

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/console/playground/prompt', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALL_CATEGORIES = ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'];

describe('POST /api/console/playground/prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSystemMessage.mockReturnValue('mocked-system-prompt-content');
  });

  it('returns systemPrompt and EXPLORE guidance for turn 1 with empty coverage', async () => {
    const body = {
      theme: 'hybrid',
      locale: 'id',
      turn: 1,
      demographics: { age: 16, gender: 'male' },
      categoriesCovered: [],
      categoriesRemaining: ALL_CATEGORIES,
    };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.systemPrompt).toBe('mocked-system-prompt-content');
    expect(json.data.guidance.instruction).toBe('EXPLORE');
    expect(json.data.guidance.targetCategory).toBe('intensitas');
    expect(json.data.guidance.isFollowUp).toBe(false);
    expect(json.error).toBeNull();
  });

  it('returns updated guidance with correct next category for turn 3 with partial coverage', async () => {
    const body = {
      theme: 'hybrid',
      locale: 'id',
      turn: 3,
      demographics: { age: 16, gender: 'male' },
      categoriesCovered: ['intensitas', 'waktu'],
      categoriesRemaining: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.guidance.instruction).toBe('EXPLORE');
    expect(json.data.guidance.targetCategory).toBe('lokasi_tubuh');
    expect(json.data.guidance.isFollowUp).toBe(false);
  });

  it('returns COMPLETE guidance when all 6 categories are covered', async () => {
    const body = {
      theme: 'hybrid',
      locale: 'id',
      turn: 7,
      demographics: { age: 16, gender: 'male' },
      categoriesCovered: ALL_CATEGORIES,
      categoriesRemaining: [],
    };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.guidance.instruction).toBe('COMPLETE');
    expect(json.data.guidance.targetCategory).toBeNull();
  });

  it('returns 400 VALIDATION_ERROR when theme is missing', async () => {
    const body = {
      locale: 'id',
      turn: 1,
      demographics: { age: 16, gender: 'male' },
      categoriesCovered: [],
      categoriesRemaining: ALL_CATEGORIES,
    };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.data).toBeNull();
  });

  it('responds within 50ms (no I/O, only computation)', async () => {
    const body = {
      theme: 'hybrid',
      locale: 'id',
      turn: 1,
      demographics: { age: 16, gender: 'male' },
      categoriesCovered: [],
      categoriesRemaining: ALL_CATEGORIES,
    };

    const start = performance.now();
    await POST(createRequest(body));
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
