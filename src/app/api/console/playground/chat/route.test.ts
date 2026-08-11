import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { AppError } from '@/lib/errors';

vi.mock('@/services/playground.service', () => ({
  processPlaygroundChat: vi.fn(),
}));

import { processPlaygroundChat } from '@/services/playground.service';
import { POST } from './route';

const mockProcessPlaygroundChat = vi.mocked(processPlaygroundChat);

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/console/playground/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_BODY = {
  provider: 'groq',
  model: 'llama-3.1-8b-instant',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
  enableScoring: false,
  locale: 'id',
  mode: 'single-shot' as const,
};

const MOCK_RESPONSE = {
  reply: 'Halo, ada yang bisa saya bantu?',
  extraction: null,
  scoring: null,
  metadata: {
    latencyMs: 450,
    model: 'llama-3.1-8b-instant',
    tokensUsed: { input: 50, output: 30 },
    provider: 'groq',
  },
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  turnNumber: 1,
};

describe('POST /api/console/playground/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success response with PlaygroundResponse data', async () => {
    mockProcessPlaygroundChat.mockResolvedValue(MOCK_RESPONSE);

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(MOCK_RESPONSE);
    expect(json.error).toBeNull();
    expect(json.meta).toBeDefined();
  });

  it('passes correct config and options to the service', async () => {
    mockProcessPlaygroundChat.mockResolvedValue(MOCK_RESPONSE);
    const body = {
      ...VALID_BODY,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      mode: 'multi-turn',
    };

    await POST(createRequest(body));

    expect(mockProcessPlaygroundChat).toHaveBeenCalledWith(
      {
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1024,
        systemPrompt: 'You are a helpful assistant.',
      },
      [{ role: 'user', content: 'Hello' }],
      {
        enableScoring: false,
        locale: 'id',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        mode: 'multi-turn',
      },
    );
  });

  it('returns 400 VALIDATION_ERROR for invalid request body', async () => {
    const response = await POST(createRequest({ provider: 'invalid' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toBeDefined();
    expect(json.data).toBeNull();
  });

  it('returns 400 VALIDATION_ERROR when messages array is empty', async () => {
    const body = { ...VALID_BODY, messages: [] };

    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 PROVIDER_NOT_CONFIGURED from service', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(
      new AppError(
        'Provider groq not configured. Add PLAYGROUND_GROQ_KEY to .env',
        400,
        'PROVIDER_NOT_CONFIGURED',
      ),
    );

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('returns 404 SESSION_NOT_FOUND from service', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(
      new AppError('Session not found', 404, 'SESSION_NOT_FOUND'),
    );

    const body = {
      ...VALID_BODY,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      mode: 'multi-turn',
    };
    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 400 SESSION_COMPLETE from service', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(
      new AppError('Maximum 7 turns reached', 400, 'SESSION_COMPLETE'),
    );

    const body = {
      ...VALID_BODY,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      mode: 'multi-turn',
    };
    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('SESSION_COMPLETE');
  });

  it('returns 504 LLM_TIMEOUT from service', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(
      new AppError('Provider did not respond within 30s', 504, 'LLM_TIMEOUT'),
    );

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(504);
    expect(json.error.code).toBe('LLM_TIMEOUT');
  });

  it('returns 502 LLM_ERROR from service', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(
      new AppError('Provider returned error: 401', 502, 'LLM_ERROR'),
    );

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error.code).toBe('LLM_ERROR');
  });

  it('returns 500 INTERNAL_ERROR on unexpected errors', async () => {
    mockProcessPlaygroundChat.mockRejectedValue(new Error('something broke'));

    const response = await POST(createRequest(VALID_BODY));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    expect(json.error.message).toBe('An unexpected error occurred');
  });

  it('does not apply rate limiting', async () => {
    mockProcessPlaygroundChat.mockResolvedValue(MOCK_RESPONSE);

    const responses = await Promise.all([
      POST(createRequest(VALID_BODY)),
      POST(createRequest(VALID_BODY)),
      POST(createRequest(VALID_BODY)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
    }
  });
});
