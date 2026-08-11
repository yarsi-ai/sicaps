// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OpenAI from 'openai';

// Mock the env module to control env vars in tests
vi.mock('../env', () => ({
  getEnv: vi.fn(),
}));

import { getEnv } from '../env';
import {
  createLLMClient,
  getPrimaryClient,
  getFallbackClient,
  getLLMConfig,
  getFallbackModel,
  _resetClients,
} from './client';

const mockedGetEnv = vi.mocked(getEnv);

const baseEnv = {
  DATABASE_URL: 'https://db.example.com',
  LLM_BASE_URL: 'https://llm.example.com/v1',
  LLM_API_KEY: 'test-api-key-123',
  LLM_MODEL: 'qwen2.5:7b',
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  NODE_ENV: 'test' as const,
  LLM_TEMPERATURE_CHAT: 0.3,
  LLM_TEMPERATURE_OUTPUT: 0.6,
  LLM_MAX_TOKENS_CHAT: 500,
  LLM_MAX_TOKENS_OUTPUT: 800,
  LLM_TOP_P: 0.9,
  LLM_TIMEOUT_MS: 12000,
  LLM_RETRY_TIMEOUT_MS: 12000,
  LLM_HEALTH_TIMEOUT_MS: 5000,
  LLM_FALLBACK_URL: undefined as string | undefined,
  LLM_FALLBACK_KEY: undefined as string | undefined,
  LLM_FALLBACK_MODEL: undefined as string | undefined,
};

describe('createLLMClient', () => {
  it('returns an OpenAI instance with the provided baseURL and apiKey', () => {
    const client = createLLMClient('https://my-provider.com/v1', 'my-key');

    expect(client).toBeInstanceOf(OpenAI);
    expect(client.baseURL).toBe('https://my-provider.com/v1');
  });

  it('creates distinct instances for different configurations', () => {
    const client1 = createLLMClient('https://provider-a.com', 'key-a');
    const client2 = createLLMClient('https://provider-b.com', 'key-b');

    expect(client1).not.toBe(client2);
    expect(client1.baseURL).toBe('https://provider-a.com');
    expect(client2.baseURL).toBe('https://provider-b.com');
  });
});

describe('getPrimaryClient', () => {
  beforeEach(() => {
    _resetClients();
    mockedGetEnv.mockReturnValue(baseEnv as ReturnType<typeof getEnv>);
  });

  afterEach(() => {
    _resetClients();
  });

  it('returns an OpenAI instance configured from env vars', () => {
    const client = getPrimaryClient();

    expect(client).toBeInstanceOf(OpenAI);
    expect(client.baseURL).toBe('https://llm.example.com/v1');
  });

  it('returns the same instance on subsequent calls (singleton)', () => {
    const client1 = getPrimaryClient();
    const client2 = getPrimaryClient();

    expect(client1).toBe(client2);
  });

  it('calls getEnv only once across multiple accesses (lazy init)', () => {
    mockedGetEnv.mockClear();

    getPrimaryClient();
    getPrimaryClient();
    getPrimaryClient();

    expect(mockedGetEnv).toHaveBeenCalledTimes(1);
  });

  it('throws when LLM_BASE_URL or LLM_API_KEY is missing (via getEnv validation)', () => {
    mockedGetEnv.mockImplementation(() => {
      throw new Error('Environment validation failed: LLM_BASE_URL is required');
    });

    expect(() => getPrimaryClient()).toThrow('LLM_BASE_URL is required');
  });
});

describe('getFallbackClient', () => {
  beforeEach(() => {
    _resetClients();
  });

  afterEach(() => {
    _resetClients();
  });

  it('returns null when fallback env vars are not configured', () => {
    mockedGetEnv.mockReturnValue(baseEnv as ReturnType<typeof getEnv>);

    const client = getFallbackClient();

    expect(client).toBeNull();
  });

  it('returns an OpenAI instance when fallback is fully configured', () => {
    mockedGetEnv.mockReturnValue({
      ...baseEnv,
      LLM_FALLBACK_URL: 'https://fallback.example.com/v1',
      LLM_FALLBACK_KEY: 'fallback-key',
      LLM_FALLBACK_MODEL: 'fallback-model',
    } as ReturnType<typeof getEnv>);

    const client = getFallbackClient();

    expect(client).toBeInstanceOf(OpenAI);
    expect(client!.baseURL).toBe('https://fallback.example.com/v1');
  });

  it('returns the same instance on subsequent calls (singleton)', () => {
    mockedGetEnv.mockReturnValue({
      ...baseEnv,
      LLM_FALLBACK_URL: 'https://fallback.example.com/v1',
      LLM_FALLBACK_KEY: 'fallback-key',
      LLM_FALLBACK_MODEL: 'fallback-model',
    } as ReturnType<typeof getEnv>);

    const client1 = getFallbackClient();
    const client2 = getFallbackClient();

    expect(client1).toBe(client2);
  });

  it('caches null result (does not re-evaluate on each call)', () => {
    mockedGetEnv.mockReturnValue(baseEnv as ReturnType<typeof getEnv>);
    mockedGetEnv.mockClear();

    getFallbackClient();
    getFallbackClient();

    // Only one call to getEnv despite two getFallbackClient() calls
    expect(mockedGetEnv).toHaveBeenCalledTimes(1);
  });
});

describe('getLLMConfig', () => {
  beforeEach(() => {
    mockedGetEnv.mockReturnValue(baseEnv as ReturnType<typeof getEnv>);
  });

  it('derives all generation parameters from env vars', () => {
    const config = getLLMConfig();

    expect(config).toEqual({
      model: 'qwen2.5:7b',
      temperatureChat: 0.3,
      temperatureOutput: 0.6,
      maxTokensChat: 500,
      maxTokensOutput: 800,
      topP: 0.9,
      timeoutMs: 12000,
      retryTimeoutMs: 12000,
      healthTimeoutMs: 5000,
    });
  });

  it('reflects custom env values', () => {
    mockedGetEnv.mockReturnValue({
      ...baseEnv,
      LLM_MODEL: 'llama3:8b',
      LLM_TEMPERATURE_CHAT: 1.0,
      LLM_MAX_TOKENS_CHAT: 1024,
      LLM_TOP_P: 0.5,
      LLM_TIMEOUT_MS: 30000,
    } as ReturnType<typeof getEnv>);

    const config = getLLMConfig();

    expect(config.model).toBe('llama3:8b');
    expect(config.temperatureChat).toBe(1.0);
    expect(config.maxTokensChat).toBe(1024);
    expect(config.topP).toBe(0.5);
    expect(config.timeoutMs).toBe(30000);
  });

  it('leaves reasoningEffort undefined when LLM_REASONING_EFFORT is unset', () => {
    // Non-reasoning providers reject the parameter, so callers must be able to
    // omit it entirely rather than send an explicit null.
    expect(getLLMConfig().reasoningEffort).toBeUndefined();
  });

  it('forwards LLM_REASONING_EFFORT when configured', () => {
    mockedGetEnv.mockReturnValue({
      ...baseEnv,
      LLM_REASONING_EFFORT: 'low',
    } as ReturnType<typeof getEnv>);

    expect(getLLMConfig().reasoningEffort).toBe('low');
  });
});

describe('getFallbackModel', () => {
  it('returns null when fallback model is not configured', () => {
    mockedGetEnv.mockReturnValue(baseEnv as ReturnType<typeof getEnv>);

    expect(getFallbackModel()).toBeNull();
  });

  it('returns the fallback model name when configured', () => {
    mockedGetEnv.mockReturnValue({
      ...baseEnv,
      LLM_FALLBACK_MODEL: 'gpt-4o-mini',
    } as ReturnType<typeof getEnv>);

    expect(getFallbackModel()).toBe('gpt-4o-mini');
  });
});
