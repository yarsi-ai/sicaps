export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

export type PlaygroundProvider = 'groq' | 'huggingface' | 'gemini' | 'ollama';

/** Env fields relevant to playground provider resolution. */
export interface PlaygroundEnv {
  PLAYGROUND_GROQ_KEY?: string;
  PLAYGROUND_HF_KEY?: string;
  PLAYGROUND_GEMINI_KEY?: string;
  PLAYGROUND_OLLAMA_URL?: string;
}

/**
 * Pure data: maps each provider to its env var key, optional URL key,
 * default base URL, and default model suggestion.
 */
export const PROVIDER_REGISTRY: Record<
  PlaygroundProvider,
  {
    envKey: keyof PlaygroundEnv;
    defaultBaseUrl: string;
    defaultModel: string;
  }
> = {
  groq: {
    envKey: 'PLAYGROUND_GROQ_KEY',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
  },
  huggingface: {
    envKey: 'PLAYGROUND_HF_KEY',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
  },
  gemini: {
    envKey: 'PLAYGROUND_GEMINI_KEY',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
  },
  ollama: {
    envKey: 'PLAYGROUND_OLLAMA_URL',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
  },
};

/**
 * Resolves provider config from environment values.
 * Pure function — caller provides env data (no I/O).
 *
 * Returns null if the required env var for the provider is not set.
 * All providers (including Ollama) require their env var to be configured.
 */
export function resolveProviderConfig(
  provider: PlaygroundProvider,
  env: PlaygroundEnv,
): ProviderConfig | null {
  const registry = PROVIDER_REGISTRY[provider];
  const value = env[registry.envKey];

  if (!value) {
    return null;
  }

  if (provider === 'ollama') {
    return { baseUrl: value, apiKey: 'ollama' };
  }

  return { baseUrl: registry.defaultBaseUrl, apiKey: value };
}

/**
 * Returns the env var name for a given provider (for error messages).
 */
export function getProviderEnvVar(provider: PlaygroundProvider): string {
  return PROVIDER_REGISTRY[provider].envKey;
}

/**
 * Returns the default/suggested model for a provider.
 * Used to pre-fill the model field in the UI when provider changes.
 */
export function getDefaultModel(provider: PlaygroundProvider): string {
  return PROVIDER_REGISTRY[provider].defaultModel;
}
