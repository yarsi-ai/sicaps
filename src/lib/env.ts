import { z } from 'zod';

export const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    // Direct/session-pooled database connection, used by `prisma migrate deploy` for DDL.
    // Optional because not all environments run migrations (e.g. simple local dev).
    DIRECT_URL: z.string().url().optional(),
    LLM_BASE_URL: z.string().url(),
    LLM_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1).default('qwen2.5:7b'),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_THEME: z.string().min(1).default('earthy'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Screening chat version switch (v1 = scripted, v2 = LLM conversational)
    SCREENING_CHAT_VERSION: z.enum(['v1', 'v2']).default('v1'),

    // LLM fallback provider (all-or-nothing group)
    LLM_FALLBACK_URL: z.string().url().optional(),
    LLM_FALLBACK_KEY: z.string().min(1).optional(),
    LLM_FALLBACK_MODEL: z.string().min(1).optional(),

    // LLM generation parameters
    LLM_TEMPERATURE_CHAT: z.coerce.number().min(0).max(2).default(0.3),
    LLM_TEMPERATURE_OUTPUT: z.coerce.number().min(0).max(2).default(0.6),
    LLM_MAX_TOKENS_CHAT: z.coerce.number().int().min(1).max(4096).default(500),
    LLM_MAX_TOKENS_OUTPUT: z.coerce.number().int().min(1).max(4096).default(800),
    LLM_TOP_P: z.coerce.number().min(0).max(1).default(0.9),

    /**
     * Thinking budget hint for reasoning models.
     *
     * Thinking models (e.g. Gemini 2.5 Flash) count thinking tokens against the
     * same output budget as `LLM_MAX_TOKENS_CHAT`, which cuts the visible reply
     * mid-word once the budget runs out. Capping the effort keeps room for the
     * reply itself.
     *
     * Left unset by default: non-thinking providers (Groq llama, Ollama) reject
     * the parameter, so it is only sent when explicitly configured.
     */
    LLM_REASONING_EFFORT: z.enum(['minimal', 'low', 'medium', 'high']).optional(),

    // LLM timeout parameters
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(12000),
    LLM_RETRY_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(12000),
    LLM_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(5000),

    // Playground provider keys (all optional — providers available only when configured)
    PLAYGROUND_GROQ_KEY: z.string().min(1).optional(),
    PLAYGROUND_HF_KEY: z.string().min(1).optional(),
    PLAYGROUND_GEMINI_KEY: z.string().min(1).optional(),
    PLAYGROUND_OLLAMA_URL: z.string().url().optional(),

    // Console PIN protection (interim auth before Phase 2 Supabase Auth)
    CONSOLE_PIN: z
      .string({ required_error: 'CONSOLE_PIN environment variable is required' })
      .min(6, 'CONSOLE_PIN must be at least 6 characters')
      .max(128, 'CONSOLE_PIN must be at most 128 characters'),
  })
  .superRefine((data, ctx) => {
    const fallbackUrl = data.LLM_FALLBACK_URL;
    const fallbackKey = data.LLM_FALLBACK_KEY;
    const fallbackModel = data.LLM_FALLBACK_MODEL;

    const set = [fallbackUrl, fallbackKey, fallbackModel].filter((v) => v !== undefined);

    if (set.length > 0 && set.length < 3) {
      if (!fallbackUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_FALLBACK_URL'],
          message: 'LLM_FALLBACK_URL is required when any fallback variable is set',
        });
      }
      if (!fallbackKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_FALLBACK_KEY'],
          message: 'LLM_FALLBACK_KEY is required when any fallback variable is set',
        });
      }
      if (!fallbackModel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LLM_FALLBACK_MODEL'],
          message: 'LLM_FALLBACK_MODEL is required when any fallback variable is set',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

/**
 * Pre-parsed env object. Access triggers validation on first use.
 * In test environments, prefer importing `envSchema` directly.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
