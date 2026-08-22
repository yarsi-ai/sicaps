import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ZodError } from 'zod';
import { envSchema } from './env';

/**
 * Property 5: Environment validation completeness
 * Validates: Requirements 3.1, 3.2, 3.3, 9.1, 9.2, 9.3, 9.4, 9.5
 */
describe('envSchema', () => {
  const validEnvArbitrary = fc.record({
    DATABASE_URL: fc.webUrl(),
    LLM_BASE_URL: fc.webUrl(),
    LLM_API_KEY: fc.string({ minLength: 1 }),
    NEXT_PUBLIC_APP_URL: fc.webUrl(),
    CONSOLE_PIN: fc.string({ minLength: 6, maxLength: 128 }),
  });

  it('parses successfully for any complete valid env var set and returns typed object', () => {
    fc.assert(
      fc.property(validEnvArbitrary, (env) => {
        const result = envSchema.safeParse(env);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data.DATABASE_URL).toBe(env.DATABASE_URL);
          expect(result.data.LLM_BASE_URL).toBe(env.LLM_BASE_URL);
          expect(result.data.LLM_API_KEY).toBe(env.LLM_API_KEY);
          expect(result.data.NEXT_PUBLIC_APP_URL).toBe(env.NEXT_PUBLIC_APP_URL);
          expect(result.data.CONSOLE_PIN).toBe(env.CONSOLE_PIN);
          expect(result.data.LLM_MODEL).toBe('qwen2.5:7b');
          expect(result.data.NODE_ENV).toBe('development');
        }
      }),
    );
  });

  it('throws ZodError for any env set missing a required var', () => {
    // NEXT_PUBLIC_APP_URL is optional in the schema (not currently used), so it
    // is excluded here — removing it must not make the set invalid.
    const requiredKeys = ['DATABASE_URL', 'LLM_BASE_URL', 'LLM_API_KEY', 'CONSOLE_PIN'] as const;

    fc.assert(
      fc.property(validEnvArbitrary, fc.constantFrom(...requiredKeys), (env, keyToRemove) => {
        const incomplete = { ...env };
        delete (incomplete as Record<string, unknown>)[keyToRemove];

        expect(() => envSchema.parse(incomplete)).toThrow(ZodError);
      }),
    );
  });

  it('applies defaults correctly when optional vars are absent', () => {
    fc.assert(
      fc.property(validEnvArbitrary, (env) => {
        const result = envSchema.parse(env);

        expect(result.LLM_MODEL).toBe('qwen2.5:7b');
        expect(result.NODE_ENV).toBe('development');
        expect(result.LLM_TEMPERATURE_CHAT).toBe(0.3);
        expect(result.LLM_TEMPERATURE_OUTPUT).toBe(0.6);
        expect(result.LLM_MAX_TOKENS_CHAT).toBe(500);
        expect(result.LLM_MAX_TOKENS_OUTPUT).toBe(800);
        expect(result.LLM_TOP_P).toBe(0.9);
        expect(result.LLM_TIMEOUT_MS).toBe(12000);
        expect(result.LLM_RETRY_TIMEOUT_MS).toBe(12000);
        expect(result.LLM_HEALTH_TIMEOUT_MS).toBe(5000);
      }),
    );
  });

  it('respects provided optional values over defaults', () => {
    const envWithOptionals = fc.record({
      DATABASE_URL: fc.webUrl(),
      LLM_BASE_URL: fc.webUrl(),
      LLM_API_KEY: fc.string({ minLength: 1 }),
      NEXT_PUBLIC_APP_URL: fc.webUrl(),
      CONSOLE_PIN: fc.string({ minLength: 6, maxLength: 128 }),
      LLM_MODEL: fc.string({ minLength: 1 }),
      NODE_ENV: fc.constantFrom('development', 'production', 'test'),
    });

    fc.assert(
      fc.property(envWithOptionals, (env) => {
        const result = envSchema.parse(env);

        expect(result.LLM_MODEL).toBe(env.LLM_MODEL);
        expect(result.NODE_ENV).toBe(env.NODE_ENV);
      }),
    );
  });

  describe('required variable validation (unit tests)', () => {
    const validBase = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      CONSOLE_PIN: 'secure-pin-123',
    };

    it('rejects missing DATABASE_URL with error mentioning the var name', () => {
      const { DATABASE_URL: _, ...without } = validBase;
      const result = envSchema.safeParse(without);

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('DATABASE_URL');
      }
    });

    it('rejects missing LLM_BASE_URL with error mentioning the var name', () => {
      const { LLM_BASE_URL: _, ...without } = validBase;
      const result = envSchema.safeParse(without);

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('LLM_BASE_URL');
      }
    });

    it('rejects missing LLM_API_KEY with error mentioning the var name', () => {
      const { LLM_API_KEY: _, ...without } = validBase;
      const result = envSchema.safeParse(without);

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('LLM_API_KEY');
      }
    });

    it('parses successfully when all required vars are valid', () => {
      const result = envSchema.safeParse(validBase);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('https://db.example.com');
        expect(result.data.LLM_BASE_URL).toBe('https://llm.example.com');
        expect(result.data.LLM_API_KEY).toBe('test-key');
        expect(result.data.NEXT_PUBLIC_APP_URL).toBe('https://app.example.com');
        expect(result.data.DIRECT_URL).toBeUndefined();
      }
    });

    it('accepts DIRECT_URL when provided as a valid URL', () => {
      const result = envSchema.safeParse({
        ...validBase,
        DIRECT_URL: 'https://direct-db.example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DIRECT_URL).toBe('https://direct-db.example.com');
      }
    });

    it('rejects DIRECT_URL when provided as an invalid URL', () => {
      const result = envSchema.safeParse({ ...validBase, DIRECT_URL: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('applies correct defaults for optional generation params', () => {
      const result = envSchema.safeParse(validBase);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_MODEL).toBe('qwen2.5:7b');
        expect(result.data.LLM_TEMPERATURE_CHAT).toBe(0.3);
        expect(result.data.LLM_TEMPERATURE_OUTPUT).toBe(0.6);
        expect(result.data.LLM_MAX_TOKENS_CHAT).toBe(500);
        expect(result.data.LLM_MAX_TOKENS_OUTPUT).toBe(800);
        expect(result.data.LLM_TOP_P).toBe(0.9);
        expect(result.data.LLM_TIMEOUT_MS).toBe(12000);
        expect(result.data.LLM_RETRY_TIMEOUT_MS).toBe(12000);
        expect(result.data.LLM_HEALTH_TIMEOUT_MS).toBe(5000);
      }
    });
  });

  describe('LLM generation parameters', () => {
    it('accepts valid numeric string coercion for generation params', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
        LLM_TEMPERATURE_CHAT: '1.5',
        LLM_TEMPERATURE_OUTPUT: '0.8',
        LLM_MAX_TOKENS_CHAT: '1024',
        LLM_MAX_TOKENS_OUTPUT: '2048',
        LLM_TOP_P: '0.5',
        LLM_TIMEOUT_MS: '30000',
        LLM_RETRY_TIMEOUT_MS: '15000',
        LLM_HEALTH_TIMEOUT_MS: '3000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_TEMPERATURE_CHAT).toBe(1.5);
        expect(result.data.LLM_TEMPERATURE_OUTPUT).toBe(0.8);
        expect(result.data.LLM_MAX_TOKENS_CHAT).toBe(1024);
        expect(result.data.LLM_MAX_TOKENS_OUTPUT).toBe(2048);
        expect(result.data.LLM_TOP_P).toBe(0.5);
        expect(result.data.LLM_TIMEOUT_MS).toBe(30000);
        expect(result.data.LLM_RETRY_TIMEOUT_MS).toBe(15000);
        expect(result.data.LLM_HEALTH_TIMEOUT_MS).toBe(3000);
      }
    });

    it('rejects LLM_TIMEOUT_MS outside bounds [1, 120000]', () => {
      const base = {
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
      };

      expect(envSchema.safeParse({ ...base, LLM_TIMEOUT_MS: '0' }).success).toBe(false);
      expect(envSchema.safeParse({ ...base, LLM_TIMEOUT_MS: '120001' }).success).toBe(false);
    });

    describe('LLM_REASONING_EFFORT', () => {
      const base = {
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
      };

      it('stays undefined when absent so non-reasoning providers get no such param', () => {
        const result = envSchema.safeParse(base);

        expect(result.success).toBe(true);
        if (result.success) expect(result.data.LLM_REASONING_EFFORT).toBeUndefined();
      });

      it('accepts each supported effort level', () => {
        for (const effort of ['minimal', 'low', 'medium', 'high'] as const) {
          const result = envSchema.safeParse({ ...base, LLM_REASONING_EFFORT: effort });

          expect(result.success).toBe(true);
          if (result.success) expect(result.data.LLM_REASONING_EFFORT).toBe(effort);
        }
      });

      it('rejects an unsupported effort level', () => {
        expect(envSchema.safeParse({ ...base, LLM_REASONING_EFFORT: 'none' }).success).toBe(false);
        expect(envSchema.safeParse({ ...base, LLM_REASONING_EFFORT: '' }).success).toBe(false);
      });
    });

    it('rejects LLM_MAX_TOKENS_CHAT outside bounds [1, 4096]', () => {
      const base = {
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
      };

      expect(envSchema.safeParse({ ...base, LLM_MAX_TOKENS_CHAT: '0' }).success).toBe(false);
      expect(envSchema.safeParse({ ...base, LLM_MAX_TOKENS_CHAT: '4097' }).success).toBe(false);
    });

    it('rejects LLM_TEMPERATURE_CHAT outside bounds [0, 2]', () => {
      const base = {
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
      };

      expect(envSchema.safeParse({ ...base, LLM_TEMPERATURE_CHAT: '-0.1' }).success).toBe(false);
      expect(envSchema.safeParse({ ...base, LLM_TEMPERATURE_CHAT: '2.1' }).success).toBe(false);
    });

    it('rejects LLM_TOP_P outside bounds [0, 1]', () => {
      const base = {
        DATABASE_URL: 'https://db.example.com',
        LLM_BASE_URL: 'https://llm.example.com',
        LLM_API_KEY: 'test-key',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        CONSOLE_PIN: 'secure-pin-123',
      };

      expect(envSchema.safeParse({ ...base, LLM_TOP_P: '-0.01' }).success).toBe(false);
      expect(envSchema.safeParse({ ...base, LLM_TOP_P: '1.01' }).success).toBe(false);
    });
  });

  /**
   * Property 10: Fallback env validation all-or-nothing
   * Validates: Requirements 9.2
   *
   * For any combination of the three fallback env vars where exactly 1 or 2
   * (but not all 3) are set, the env validation SHALL reject with an error
   * indicating which vars are missing.
   */
  describe('Property 10: fallback env validation all-or-nothing', () => {
    const fallbackVarNames = [
      'LLM_FALLBACK_URL',
      'LLM_FALLBACK_KEY',
      'LLM_FALLBACK_MODEL',
    ] as const;

    /** Generate a subset of exactly 1 or 2 fallback vars (incomplete set) */
    const incompleteFallbackSubsetArb = fc
      .subarray(fallbackVarNames as unknown as string[], { minLength: 1, maxLength: 2 })
      .filter((s) => s.length >= 1 && s.length <= 2);

    /** Generate valid values for each fallback var type */
    const fallbackValueArb = (varName: string) => {
      if (varName === 'LLM_FALLBACK_URL') return fc.webUrl();
      return fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
    };

    it('rejects when exactly 1 or 2 fallback vars are provided', () => {
      fc.assert(
        fc.property(
          incompleteFallbackSubsetArb,
          fc.webUrl(),
          fc.webUrl(),
          fc.string({ minLength: 1 }),
          fc.webUrl(),
          fc.string({ minLength: 6, maxLength: 128 }),
          (subset, dbUrl, llmUrl, llmKey, appUrl, consolePin) => {
            const baseEnv: Record<string, string> = {
              DATABASE_URL: dbUrl,
              LLM_BASE_URL: llmUrl,
              LLM_API_KEY: llmKey,
              NEXT_PUBLIC_APP_URL: appUrl,
              CONSOLE_PIN: consolePin,
            };

            // Build the env with only the selected subset of fallback vars
            const envWithPartialFallback: Record<string, string> = { ...baseEnv };
            for (const varName of subset) {
              if (varName === 'LLM_FALLBACK_URL') {
                envWithPartialFallback[varName] = 'https://fallback.example.com/v1';
              } else {
                envWithPartialFallback[varName] = 'fallback-value';
              }
            }

            const result = envSchema.safeParse(envWithPartialFallback);
            expect(result.success).toBe(false);

            if (!result.success) {
              // Verify errors reference the missing fallback vars
              const errorPaths = result.error.issues.map((i) => i.path[0]);
              const missingVars = fallbackVarNames.filter((v) => !subset.includes(v));
              for (const missing of missingVars) {
                expect(errorPaths).toContain(missing);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects with generated valid values for the provided subset', () => {
      fc.assert(
        fc.property(
          incompleteFallbackSubsetArb.chain((subset) =>
            fc.tuple(fc.constant(subset), ...subset.map((varName) => fallbackValueArb(varName))),
          ),
          (tuple) => {
            const [subset, ...values] = tuple as [string[], ...string[]];

            const baseEnv: Record<string, string> = {
              DATABASE_URL: 'https://db.example.com',
              LLM_BASE_URL: 'https://llm.example.com',
              LLM_API_KEY: 'test-key',
              NEXT_PUBLIC_APP_URL: 'https://app.example.com',
              CONSOLE_PIN: 'secure-pin-123',
            };

            const envWithPartialFallback: Record<string, string> = { ...baseEnv };
            subset.forEach((varName, i) => {
              envWithPartialFallback[varName] = values[i]!;
            });

            const result = envSchema.safeParse(envWithPartialFallback);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('fallback group validation (all-or-nothing)', () => {
    const baseEnv = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      CONSOLE_PIN: 'secure-pin-123',
    };

    it('accepts when all three fallback vars are provided', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_URL: 'https://fallback.example.com',
        LLM_FALLBACK_KEY: 'fallback-key',
        LLM_FALLBACK_MODEL: 'fallback-model',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_FALLBACK_URL).toBe('https://fallback.example.com');
        expect(result.data.LLM_FALLBACK_KEY).toBe('fallback-key');
        expect(result.data.LLM_FALLBACK_MODEL).toBe('fallback-model');
      }
    });

    it('accepts when no fallback vars are provided', () => {
      const result = envSchema.safeParse(baseEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_FALLBACK_URL).toBeUndefined();
        expect(result.data.LLM_FALLBACK_KEY).toBeUndefined();
        expect(result.data.LLM_FALLBACK_MODEL).toBeUndefined();
      }
    });

    it('rejects when only LLM_FALLBACK_URL is set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_URL: 'https://fallback.example.com',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('LLM_FALLBACK_KEY');
        expect(paths).toContain('LLM_FALLBACK_MODEL');
      }
    });

    it('rejects when only LLM_FALLBACK_KEY is set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_KEY: 'some-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('LLM_FALLBACK_URL');
        expect(paths).toContain('LLM_FALLBACK_MODEL');
      }
    });

    it('rejects when only LLM_FALLBACK_MODEL is set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_MODEL: 'some-model',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('LLM_FALLBACK_URL');
        expect(paths).toContain('LLM_FALLBACK_KEY');
      }
    });

    it('rejects when exactly 2 of 3 fallback vars are set', () => {
      // URL + KEY but missing MODEL
      const r1 = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_URL: 'https://fallback.example.com',
        LLM_FALLBACK_KEY: 'key',
      });
      expect(r1.success).toBe(false);

      // URL + MODEL but missing KEY
      const r2 = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_URL: 'https://fallback.example.com',
        LLM_FALLBACK_MODEL: 'model',
      });
      expect(r2.success).toBe(false);

      // KEY + MODEL but missing URL
      const r3 = envSchema.safeParse({
        ...baseEnv,
        LLM_FALLBACK_KEY: 'key',
        LLM_FALLBACK_MODEL: 'model',
      });
      expect(r3.success).toBe(false);
    });
  });

  /**
   * Property 6: Environment validation rejects invalid CONSOLE_PIN
   *
   * For any environment configuration where CONSOLE_PIN is missing, empty, or
   * shorter than 6 characters, the application startup validation SHALL fail
   * with an error message that identifies CONSOLE_PIN as the invalid variable.
   *
   * **Validates: Requirements 5.1, 5.2, 5.5**
   *
   * CONSOLE_PIN must be 6-128 characters. Missing, empty, or too-short values
   * fail startup validation with an error that identifies CONSOLE_PIN.
   */
  describe('Property 6: CONSOLE_PIN environment validation', () => {
    const baseEnvWithoutPin = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    };

    it('rejects missing CONSOLE_PIN with error identifying the variable', () => {
      const result = envSchema.safeParse(baseEnvWithoutPin);

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('CONSOLE_PIN');
      }
    });

    it('rejects empty CONSOLE_PIN with error identifying the variable', () => {
      const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('CONSOLE_PIN');
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('CONSOLE_PIN'))).toBe(true);
      }
    });

    it('rejects CONSOLE_PIN shorter than 6 characters', () => {
      const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: '12345' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('CONSOLE_PIN');
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('at least 6'))).toBe(true);
      }
    });

    it('accepts CONSOLE_PIN with exactly 6 characters (minimum valid length)', () => {
      const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: '123456' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CONSOLE_PIN).toBe('123456');
      }
    });

    it('accepts CONSOLE_PIN with exactly 128 characters (maximum valid length)', () => {
      const pin128 = 'a'.repeat(128);
      const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: pin128 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CONSOLE_PIN).toBe(pin128);
      }
    });

    it('rejects CONSOLE_PIN longer than 128 characters', () => {
      const pin129 = 'a'.repeat(129);
      const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: pin129 });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('CONSOLE_PIN');
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('at most 128'))).toBe(true);
      }
    });

    it('accepts any valid CONSOLE_PIN within length bounds (property test)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 6, maxLength: 128 }), (pin) => {
          const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: pin });
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.CONSOLE_PIN).toBe(pin);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('rejects any CONSOLE_PIN shorter than 6 characters (property test)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 5 }), (pin) => {
          const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: pin });
          expect(result.success).toBe(false);
        }),
        { numRuns: 50 },
      );
    });

    it('rejects any CONSOLE_PIN longer than 128 characters (property test)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 129, maxLength: 200 }), (pin) => {
          const result = envSchema.safeParse({ ...baseEnvWithoutPin, CONSOLE_PIN: pin });
          expect(result.success).toBe(false);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Vision API environment validation (conditional on SCREENING_CHAT_VERSION)
   *
   * When SCREENING_CHAT_VERSION=v2, VISION_MODEL_URL is required.
   * VISION_MODEL_API_KEY is always optional — the configured vision endpoint
   * does not require authentication, and predictVisual() only attaches an
   * Authorization header when a key is present.
   *
   * **Validates: Requirement 6.1** (visual-detection spec)
   */
  describe('Vision API environment validation', () => {
    const baseEnv = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      CONSOLE_PIN: 'secure-pin-123',
    };

    it('accepts v1 mode without vision vars (default behavior)', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SCREENING_CHAT_VERSION).toBe('v1');
        expect(result.data.VISION_MODEL_URL).toBeUndefined();
        expect(result.data.VISION_MODEL_API_KEY).toBeUndefined();
      }
    });

    it('accepts absent SCREENING_CHAT_VERSION (defaults to v1) without vision vars', () => {
      const result = envSchema.safeParse(baseEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SCREENING_CHAT_VERSION).toBe('v1');
        expect(result.data.VISION_MODEL_URL).toBeUndefined();
        expect(result.data.VISION_MODEL_API_KEY).toBeUndefined();
      }
    });

    it('rejects v2 mode when VISION_MODEL_URL is missing', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_API_KEY: 'vision-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('VISION_MODEL_URL');
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('VISION_MODEL_URL') && m.includes('v2'))).toBe(true);
      }
    });

    it('accepts v2 mode without VISION_MODEL_API_KEY, since it is always optional', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.VISION_MODEL_URL).toBe('https://vision.example.com');
        expect(result.data.VISION_MODEL_API_KEY).toBeUndefined();
      }
    });

    it('rejects v2 mode when VISION_MODEL_URL is missing, even with an API key set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_API_KEY: 'vision-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('VISION_MODEL_URL');
        expect(paths).not.toContain('VISION_MODEL_API_KEY');
      }
    });

    it('accepts v2 mode when all vision vars are provided', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-secret-key',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SCREENING_CHAT_VERSION).toBe('v2');
        expect(result.data.VISION_MODEL_URL).toBe('https://vision.example.com');
        expect(result.data.VISION_MODEL_API_KEY).toBe('vision-secret-key');
        expect(result.data.VISION_TIMEOUT_MS).toBe(12000); // default
      }
    });

    it('accepts custom VISION_TIMEOUT_MS when provided with v2', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-secret-key',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        VISION_TIMEOUT_MS: '30000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.VISION_TIMEOUT_MS).toBe(30000);
      }
    });

    it('rejects VISION_TIMEOUT_MS outside bounds [1, 120000]', () => {
      const r1 = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-secret-key',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        VISION_TIMEOUT_MS: '0',
      });
      expect(r1.success).toBe(false);

      const r2 = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-secret-key',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        VISION_TIMEOUT_MS: '120001',
      });
      expect(r2.success).toBe(false);
    });

    it('rejects invalid VISION_MODEL_URL (not a URL)', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'not-a-url',
        VISION_MODEL_API_KEY: 'vision-secret-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('VISION_MODEL_URL');
      }
    });

    it('accepts v1 mode with vision vars present (optional extra config)', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v1',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-secret-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SCREENING_CHAT_VERSION).toBe('v1');
        expect(result.data.VISION_MODEL_URL).toBe('https://vision.example.com');
        expect(result.data.VISION_MODEL_API_KEY).toBe('vision-secret-key');
      }
    });

    /**
     * Regression: `.env` files commonly leave an unset optional var as `KEY=`
     * rather than omitting the line, which process.env reads as `""`. This
     * broke every deployment that left VISION_MODEL_API_KEY blank — validation
     * threw before the request handler ever ran, taking down chat and image
     * upload alike even though the endpoint needs no key at all.
     */
    it('treats a blank VISION_MODEL_API_KEY the same as an absent one', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: '',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.VISION_MODEL_API_KEY).toBeUndefined();
      }
    });
  });

  /**
   * Supabase Storage environment validation.
   *
   * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are optional in every mode,
   * including v2: storage is not required to run visual detection, only the
   * vision API is. Their absence means `submitImage()` skips the storage
   * upload (storage.service.ts#isStorageConfigured) and leaves `storagePath`
   * null — analysis and phase progression are unaffected.
   */
  describe('Supabase Storage environment validation', () => {
    const baseEnv = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      CONSOLE_PIN: 'secure-pin-123',
    };

    it('accepts v1 mode without Supabase Storage vars', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_URL).toBeUndefined();
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      }
    });

    it('accepts v2 mode without SUPABASE_URL — storage is optional even here', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_URL).toBeUndefined();
      }
    });

    it('accepts v2 mode without SUPABASE_SERVICE_ROLE_KEY — storage is optional even here', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-key',
        SUPABASE_URL: 'https://project.supabase.co',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      }
    });

    it('normalizes a blank SUPABASE_SERVICE_ROLE_KEY to absent rather than an empty key', () => {
      // Same `KEY=` blank-line issue as VISION_MODEL_API_KEY. Since this var is
      // never required, the only thing to verify is the normalization itself.
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      }
    });

    it('accepts v2 mode when both Supabase vars are absent', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_URL).toBeUndefined();
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      }
    });

    it('accepts v2 mode when Supabase vars are provided', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-key',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_URL).toBe('https://project.supabase.co');
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
      }
    });

    it('rejects invalid SUPABASE_URL (not a URL) even though the var is optional', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
        VISION_MODEL_URL: 'https://vision.example.com',
        VISION_MODEL_API_KEY: 'vision-key',
        SUPABASE_URL: 'not-a-url',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('SUPABASE_URL');
      }
    });

    it('accepts v1 mode with Supabase vars present (optional extra config)', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v1',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SUPABASE_URL).toBe('https://project.supabase.co');
        expect(result.data.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
      }
    });
  });

  /**
   * VISION_MODEL_URL remains the one hard v2 dependency: it is what
   * getSupabaseClient's sibling, predictVisual(), actually calls, and there is
   * no "skip if unconfigured" path for it the way there is for storage.
   */
  describe('VISION_MODEL_URL requirement under v2', () => {
    const baseEnv = {
      DATABASE_URL: 'https://db.example.com',
      LLM_BASE_URL: 'https://llm.example.com',
      LLM_API_KEY: 'test-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      CONSOLE_PIN: 'secure-pin-123',
    };

    it('rejects v2 mode when VISION_MODEL_URL is missing, with no Supabase vars set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SCREENING_CHAT_VERSION: 'v2',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('VISION_MODEL_URL');
        expect(paths).not.toContain('SUPABASE_URL');
        expect(paths).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      }
    });
  });
});
