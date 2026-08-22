import { z } from 'zod';

/**
 * An optional, non-empty string env var.
 *
 * `.env` files commonly leave an unset optional var as `KEY=` rather than
 * omitting the line, which `process.env` reads as `""`, not `undefined`.
 * Plain `z.string().min(1).optional()` only tolerates the latter, so an
 * intentionally-blank key throws instead of being treated as absent —
 * `VISION_MODEL_API_KEY=` failed this way. The preprocess step normalizes
 * blank to absent before the length check ever runs.
 */
function optionalNonEmptyString() {
  return z.preprocess((val) => (val === '' ? undefined : val), z.string().min(1).optional());
}

/** Same normalization for an optional URL var (e.g. `LLM_FALLBACK_URL=`). */
function optionalUrlString() {
  return z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional());
}

export const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    // Direct/session-pooled database connection, used by `prisma migrate deploy` for DDL.
    // Optional because not all environments run migrations (e.g. simple local dev).
    DIRECT_URL: optionalUrlString(),
    LLM_BASE_URL: z.string().url(),
    LLM_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1).default('qwen2.5:7b'),
    NEXT_PUBLIC_APP_URL: optionalUrlString(),
    NEXT_PUBLIC_THEME: z.string().min(1).default('earthy'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Screening chat version switch (v1 = scripted, v2 = LLM conversational)
    SCREENING_CHAT_VERSION: z.enum(['v1', 'v2']).default('v1'),

    // LLM fallback provider (all-or-nothing group)
    LLM_FALLBACK_URL: optionalUrlString(),
    LLM_FALLBACK_KEY: optionalNonEmptyString(),
    LLM_FALLBACK_MODEL: optionalNonEmptyString(),

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

    // Vision API configuration (required when SCREENING_CHAT_VERSION=v2)
    VISION_MODEL_URL: optionalUrlString(),
    VISION_MODEL_API_KEY: optionalNonEmptyString(),
    VISION_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(12000),

    // Supabase Storage configuration. Optional even under v2 — screening
    // images are analysed regardless; without these, uploaded photos are just
    // not persisted to storage. See storage.service.ts#isStorageConfigured.
    SUPABASE_URL: optionalUrlString(),
    SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString(),

    // Playground provider keys (all optional — providers available only when configured)
    PLAYGROUND_GROQ_KEY: optionalNonEmptyString(),
    PLAYGROUND_HF_KEY: optionalNonEmptyString(),
    PLAYGROUND_GEMINI_KEY: optionalNonEmptyString(),
    PLAYGROUND_OLLAMA_URL: optionalUrlString(),

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
  })
  .superRefine((data, ctx) => {
    // Only VISION_MODEL_URL is required when SCREENING_CHAT_VERSION=v2: it is
    // the actual analysis dependency. Supabase Storage is not required to run
    // v2 — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are optional in the schema
    // above, and their absence just means submitImage() skips the storage
    // upload (see storage.service.ts#isStorageConfigured); the vision
    // prediction and phase progression proceed either way.
    if (data.SCREENING_CHAT_VERSION === 'v2') {
      if (!data.VISION_MODEL_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VISION_MODEL_URL'],
          message: 'VISION_MODEL_URL is required when SCREENING_CHAT_VERSION is v2',
        });
      }
      // VISION_MODEL_API_KEY is intentionally not required here: the
      // configured vision endpoint does not require authentication. It stays
      // optional in the schema above for endpoints that do.
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
