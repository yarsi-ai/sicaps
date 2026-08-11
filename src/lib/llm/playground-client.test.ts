// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  PROVIDER_REGISTRY,
  resolveProviderConfig,
  getProviderEnvVar,
  getDefaultModel,
  type PlaygroundEnv,
  type PlaygroundProvider,
} from './playground-client';

describe('PROVIDER_REGISTRY', () => {
  it('contains entries for all 4 providers', () => {
    const providers: PlaygroundProvider[] = ['groq', 'huggingface', 'gemini', 'ollama'];
    for (const p of providers) {
      expect(PROVIDER_REGISTRY[p]).toBeDefined();
      expect(PROVIDER_REGISTRY[p].envKey).toBeTruthy();
      expect(PROVIDER_REGISTRY[p].defaultBaseUrl).toBeTruthy();
      expect(PROVIDER_REGISTRY[p].defaultModel).toBeTruthy();
    }
  });

  it('has correct baseUrls per provider', () => {
    expect(PROVIDER_REGISTRY.groq.defaultBaseUrl).toBe('https://api.groq.com/openai/v1');
    expect(PROVIDER_REGISTRY.huggingface.defaultBaseUrl).toBe('https://router.huggingface.co/v1');
    expect(PROVIDER_REGISTRY.gemini.defaultBaseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/',
    );
    expect(PROVIDER_REGISTRY.ollama.defaultBaseUrl).toBe('http://localhost:11434/v1');
  });
});

describe('resolveProviderConfig', () => {
  it('returns config with apiKey when groq key is set', () => {
    const env: PlaygroundEnv = { PLAYGROUND_GROQ_KEY: 'gsk_test123' };
    const config = resolveProviderConfig('groq', env);

    expect(config).toEqual({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk_test123',
    });
  });

  it('returns config with apiKey when huggingface key is set', () => {
    const env: PlaygroundEnv = { PLAYGROUND_HF_KEY: 'hf_test456' };
    const config = resolveProviderConfig('huggingface', env);

    expect(config).toEqual({
      baseUrl: 'https://router.huggingface.co/v1',
      apiKey: 'hf_test456',
    });
  });

  it('returns config with apiKey when gemini key is set', () => {
    const env: PlaygroundEnv = { PLAYGROUND_GEMINI_KEY: 'AIza_test789' };
    const config = resolveProviderConfig('gemini', env);

    expect(config).toEqual({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: 'AIza_test789',
    });
  });

  it('returns null when groq key is not set', () => {
    const config = resolveProviderConfig('groq', {});
    expect(config).toBeNull();
  });

  it('returns null when huggingface key is not set', () => {
    const config = resolveProviderConfig('huggingface', {});
    expect(config).toBeNull();
  });

  it('returns null when gemini key is not set', () => {
    const config = resolveProviderConfig('gemini', {});
    expect(config).toBeNull();
  });

  it('returns ollama config with URL when env is set', () => {
    const env: PlaygroundEnv = { PLAYGROUND_OLLAMA_URL: 'http://192.168.1.100:11434/v1' };
    const config = resolveProviderConfig('ollama', env);

    expect(config).toEqual({
      baseUrl: 'http://192.168.1.100:11434/v1',
      apiKey: 'ollama',
    });
  });

  it('returns null when ollama URL is not set', () => {
    const config = resolveProviderConfig('ollama', {});
    expect(config).toBeNull();
  });
});

describe('getProviderEnvVar', () => {
  it('returns PLAYGROUND_GROQ_KEY for groq', () => {
    expect(getProviderEnvVar('groq')).toBe('PLAYGROUND_GROQ_KEY');
  });

  it('returns PLAYGROUND_HF_KEY for huggingface', () => {
    expect(getProviderEnvVar('huggingface')).toBe('PLAYGROUND_HF_KEY');
  });

  it('returns PLAYGROUND_GEMINI_KEY for gemini', () => {
    expect(getProviderEnvVar('gemini')).toBe('PLAYGROUND_GEMINI_KEY');
  });

  it('returns PLAYGROUND_OLLAMA_URL for ollama', () => {
    expect(getProviderEnvVar('ollama')).toBe('PLAYGROUND_OLLAMA_URL');
  });
});

describe('getDefaultModel', () => {
  it('returns llama-3.1-8b-instant for groq', () => {
    expect(getDefaultModel('groq')).toBe('llama-3.1-8b-instant');
  });

  it('returns Qwen/Qwen2.5-7B-Instruct for huggingface', () => {
    expect(getDefaultModel('huggingface')).toBe('Qwen/Qwen2.5-7B-Instruct');
  });

  it('returns gemini-2.5-flash for gemini', () => {
    expect(getDefaultModel('gemini')).toBe('gemini-2.5-flash');
  });

  it('returns qwen2.5:7b for ollama', () => {
    expect(getDefaultModel('ollama')).toBe('qwen2.5:7b');
  });
});
