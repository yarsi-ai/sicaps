import OpenAI from 'openai';
import { getEnv } from '../env';

/**
 * Generation parameters derived from environment variables.
 * All values are configurable via LLM_* env vars with sensible defaults.
 */
export interface LLMConfig {
  model: string;
  temperatureChat: number;
  temperatureOutput: number;
  maxTokensChat: number;
  maxTokensOutput: number;
  topP: number;
  timeoutMs: number;
  retryTimeoutMs: number;
  healthTimeoutMs: number;
  /**
   * Thinking budget hint, forwarded as `reasoning_effort`. Undefined when the
   * active provider is not a reasoning model — the parameter must then be
   * omitted from the request entirely rather than sent as null.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

/**
 * NOTE: `responseFormat: { type: "json_object" }` is NOT part of LLMConfig.
 * It is an invariant applied directly in the stream call helper at the service layer
 * (services/llm.service.ts), since it is always required for structured output
 * and is not user-configurable.
 */

let _primaryClient: OpenAI | undefined;
let _fallbackClient: OpenAI | null | undefined;

/**
 * Creates an OpenAI SDK instance configured with a custom base URL and API key.
 * Used internally for both primary and fallback providers.
 */
export function createLLMClient(baseUrl: string, apiKey: string): OpenAI {
  return new OpenAI({
    baseURL: baseUrl,
    apiKey,
  });
}

/**
 * Returns the primary LLM client as a singleton (lazy-initialized).
 * Throws a descriptive error if LLM_BASE_URL or LLM_API_KEY is missing/invalid.
 */
export function getPrimaryClient(): OpenAI {
  if (!_primaryClient) {
    const env = getEnv();
    _primaryClient = createLLMClient(env.LLM_BASE_URL, env.LLM_API_KEY);
  }
  return _primaryClient;
}

/**
 * Returns the fallback LLM client, or null if fallback is unconfigured.
 * Lazy-initialized singleton — only created once on first access.
 */
export function getFallbackClient(): OpenAI | null {
  if (_fallbackClient === undefined) {
    const env = getEnv();

    if (env.LLM_FALLBACK_URL && env.LLM_FALLBACK_KEY) {
      _fallbackClient = createLLMClient(env.LLM_FALLBACK_URL, env.LLM_FALLBACK_KEY);
    } else {
      _fallbackClient = null;
    }
  }
  return _fallbackClient;
}

/**
 * Returns the active LLM configuration derived from validated env vars.
 * All generation parameters fall back to their Zod-defined defaults when absent.
 */
export function getLLMConfig(): LLMConfig {
  const env = getEnv();

  return {
    model: env.LLM_MODEL,
    temperatureChat: env.LLM_TEMPERATURE_CHAT,
    temperatureOutput: env.LLM_TEMPERATURE_OUTPUT,
    maxTokensChat: env.LLM_MAX_TOKENS_CHAT,
    maxTokensOutput: env.LLM_MAX_TOKENS_OUTPUT,
    topP: env.LLM_TOP_P,
    timeoutMs: env.LLM_TIMEOUT_MS,
    retryTimeoutMs: env.LLM_RETRY_TIMEOUT_MS,
    healthTimeoutMs: env.LLM_HEALTH_TIMEOUT_MS,
    reasoningEffort: env.LLM_REASONING_EFFORT,
  };
}

/**
 * Returns the fallback model name, or null if fallback is unconfigured.
 */
export function getFallbackModel(): string | null {
  const env = getEnv();
  return env.LLM_FALLBACK_MODEL ?? null;
}

/**
 * Resets singleton instances. Intended for test isolation only.
 * @internal
 */
export function _resetClients(): void {
  _primaryClient = undefined;
  _fallbackClient = undefined;
}
