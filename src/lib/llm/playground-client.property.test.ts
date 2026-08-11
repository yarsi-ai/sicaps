// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  PROVIDER_REGISTRY,
  resolveProviderConfig,
  type PlaygroundProvider,
  type PlaygroundEnv,
} from './playground-client';
import { playgroundChatRequestSchema } from '@/app/api/console/playground/chat/schema';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const providerArb = fc.constantFrom<PlaygroundProvider>('groq', 'huggingface', 'gemini', 'ollama');
const nonOllamaProviderArb = fc.constantFrom<PlaygroundProvider>('groq', 'huggingface', 'gemini');
const apiKeyArb = fc.string({ minLength: 5, maxLength: 64 }).filter((s) => !s.includes('\n'));

// ─── Property 10: Provider resolution correctness ────────────────────────────

describe('Property 10: Provider resolution correctness', () => {
  it('for any provider with env var set, resolveProviderConfig returns non-null with correct baseUrl', () => {
    fc.assert(
      fc.property(providerArb, apiKeyArb, (provider, key) => {
        const env: PlaygroundEnv = {};

        if (provider === 'ollama') {
          env.PLAYGROUND_OLLAMA_URL = 'http://localhost:11434/v1';
        } else {
          env[PROVIDER_REGISTRY[provider].envKey] = key;
        }

        const result = resolveProviderConfig(provider, env);
        expect(result).not.toBeNull();
        expect(result!.baseUrl).toBe(PROVIDER_REGISTRY[provider].defaultBaseUrl);
      }),
      { numRuns: 100 },
    );
  });

  it('for any non-ollama provider with env var NOT set, resolveProviderConfig returns null', () => {
    fc.assert(
      fc.property(nonOllamaProviderArb, (provider) => {
        const result = resolveProviderConfig(provider, {});
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('ollama returns null when PLAYGROUND_OLLAMA_URL is not set', () => {
    const result = resolveProviderConfig('ollama', {});
    expect(result).toBeNull();
  });

  it('ollama returns non-null when PLAYGROUND_OLLAMA_URL is set', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const env: PlaygroundEnv = { PLAYGROUND_OLLAMA_URL: url };
        const result = resolveProviderConfig('ollama', env);
        expect(result).not.toBeNull();
        expect(result!.baseUrl).toBe(url);
        expect(result!.apiKey).toBe('ollama');
      }),
      { numRuns: 100 },
    );
  });

  it('resolved apiKey matches the env var value for non-ollama providers', () => {
    fc.assert(
      fc.property(nonOllamaProviderArb, apiKeyArb, (provider, key) => {
        const env: PlaygroundEnv = {};
        env[PROVIDER_REGISTRY[provider].envKey] = key;

        const result = resolveProviderConfig(provider, env);
        expect(result).not.toBeNull();
        expect(result!.apiKey).toBe(key);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Request schema validation ──────────────────────────────────

const validRequestArb = fc.record({
  provider: fc.constantFrom(
    'groq' as const,
    'huggingface' as const,
    'gemini' as const,
    'ollama' as const,
  ),
  model: fc.string({ minLength: 1, maxLength: 100 }),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  topP: fc.double({ min: 0, max: 1, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 4096 }),
  systemPrompt: fc.string({ minLength: 1, maxLength: 500 }),
  messages: fc.array(
    fc.record({
      role: fc.constantFrom('user' as const, 'assistant' as const),
      content: fc.string({ minLength: 1, maxLength: 200 }),
    }),
    { minLength: 1, maxLength: 5 },
  ),
  enableScoring: fc.boolean(),
  locale: fc.constantFrom('id' as const, 'en' as const),
  sessionId: fc.option(fc.uuid(), { nil: undefined }),
  mode: fc.constantFrom('single-shot' as const, 'multi-turn' as const, 'compare' as const),
});

describe('Property 11: Request schema validation', () => {
  it('valid request bodies always pass schema validation', () => {
    fc.assert(
      fc.property(validRequestArb, (request) => {
        const result = playgroundChatRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('missing required fields always fail schema validation', () => {
    const requiredFields = [
      'provider',
      'model',
      'temperature',
      'topP',
      'maxTokens',
      'systemPrompt',
      'messages',
      'mode',
    ] as const;

    fc.assert(
      fc.property(validRequestArb, fc.constantFrom(...requiredFields), (request, fieldToRemove) => {
        const mutated = { ...request };
        delete (mutated as Record<string, unknown>)[fieldToRemove];
        const result = playgroundChatRequestSchema.safeParse(mutated);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('out-of-range temperature always fails validation', () => {
    fc.assert(
      fc.property(
        validRequestArb,
        fc.oneof(
          fc.double({ min: 2.001, max: 100, noNaN: true }),
          fc.double({ min: -100, max: -0.001, noNaN: true }),
        ),
        (request, badTemp) => {
          const mutated = { ...request, temperature: badTemp };
          const result = playgroundChatRequestSchema.safeParse(mutated);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('out-of-range topP always fails validation', () => {
    fc.assert(
      fc.property(
        validRequestArb,
        fc.oneof(
          fc.double({ min: 1.001, max: 100, noNaN: true }),
          fc.double({ min: -100, max: -0.001, noNaN: true }),
        ),
        (request, badTopP) => {
          const mutated = { ...request, topP: badTopP };
          const result = playgroundChatRequestSchema.safeParse(mutated);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('out-of-range maxTokens always fails validation', () => {
    fc.assert(
      fc.property(
        validRequestArb,
        fc.oneof(fc.integer({ min: 4097, max: 99999 }), fc.integer({ min: -100, max: 0 })),
        (request, badTokens) => {
          const mutated = { ...request, maxTokens: badTokens };
          const result = playgroundChatRequestSchema.safeParse(mutated);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty messages array always fails validation', () => {
    fc.assert(
      fc.property(validRequestArb, (request) => {
        const mutated = { ...request, messages: [] };
        const result = playgroundChatRequestSchema.safeParse(mutated);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('invalid provider string always fails validation', () => {
    fc.assert(
      fc.property(
        validRequestArb,
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !['groq', 'huggingface', 'gemini', 'ollama'].includes(s)),
        (request, badProvider) => {
          const mutated = { ...request, provider: badProvider };
          const result = playgroundChatRequestSchema.safeParse(mutated);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
