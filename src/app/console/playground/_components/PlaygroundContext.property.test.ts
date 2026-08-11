/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Property tests use array indices extensively; TS strict noUncheckedIndexedAccess is overzealous here
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { savePreset, loadPreset, listPresets } from './playground-presets';
import { buildSingleShotMessages, addResult, isReverseChronological } from './playground-state';
import type { PlaygroundConfig, PlaygroundResult, PlaygroundProvider } from './PlaygroundContext';

// --- Arbitraries ---

const providerArb: fc.Arbitrary<PlaygroundProvider> = fc.constantFrom(
  'groq',
  'huggingface',
  'gemini',
  'ollama',
);

const playgroundConfigArb: fc.Arbitrary<PlaygroundConfig> = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  topP: fc.double({ min: 0, max: 1, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 4096 }),
  systemPrompt: fc.string({ minLength: 1, maxLength: 500 }),
});

const presetNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

const userMessageArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

function makeResult(timestamp: number, index: number): PlaygroundResult {
  return {
    id: `result-${index}`,
    input: `message-${index}`,
    config: {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 2048,
      systemPrompt: 'test',
    },
    response: null,
    error: null,
    loading: false,
    timestamp,
  };
}

// --- localStorage mock ---

beforeEach(() => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });
});

// --- Property 1: Preset serialization round-trip ---
// Feature: llm-playground, Property 1: Preset serialization round-trip
// **Validates: Requirements 2.1**

describe('Property 1: Preset round-trip (save → load = deep equal)', () => {
  it('for any valid PlaygroundConfig, save then load returns deeply equal config', () => {
    fc.assert(
      fc.property(presetNameArb, playgroundConfigArb, (name, config) => {
        // Clear storage before each iteration
        localStorage.clear();

        savePreset(name, config);
        const loaded = loadPreset(name);

        expect(loaded).toBeDefined();
        expect(loaded!.provider).toBe(config.provider);
        expect(loaded!.model).toBe(config.model);
        expect(loaded!.temperature).toBe(config.temperature);
        expect(loaded!.topP).toBe(config.topP);
        expect(loaded!.maxTokens).toBe(config.maxTokens);
        expect(loaded!.systemPrompt).toBe(config.systemPrompt);
      }),
      { numRuns: 100 },
    );
  });

  it('saving multiple presets preserves each independently', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(presetNameArb, { minLength: 2, maxLength: 5 }),
        fc.array(playgroundConfigArb, { minLength: 2, maxLength: 5 }),
        (names, configs) => {
          localStorage.clear();
          const count = Math.min(names.length, configs.length);

          for (let i = 0; i < count; i++) {
            savePreset(names[i], configs[i]);
          }

          for (let i = 0; i < count; i++) {
            const loaded = loadPreset(names[i]);
            expect(loaded).toBeDefined();
            expect(loaded!.provider).toBe(configs[i].provider);
            expect(loaded!.model).toBe(configs[i].model);
            expect(loaded!.maxTokens).toBe(configs[i].maxTokens);
          }

          const presets = listPresets();
          expect(presets.length).toBe(count);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// --- Property 3: Single-shot message independence ---
// Feature: llm-playground, Property 3: Single-shot message independence
// **Validates: Requirements 3.1**

describe('Property 3: Single-shot independence (each call has exactly 1 user message)', () => {
  it('for any sequence of N messages, each buildSingleShotMessages call produces exactly 1 user message', () => {
    fc.assert(
      fc.property(fc.array(userMessageArb, { minLength: 1, maxLength: 20 }), (messages) => {
        // Simulate N sequential single-shot calls
        for (const msg of messages) {
          const apiMessages = buildSingleShotMessages(msg);

          // Each call must produce exactly 1 message
          expect(apiMessages).toHaveLength(1);
          expect(apiMessages[0].role).toBe('user');
          expect(apiMessages[0].content).toBe(msg);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('single-shot messages never contain assistant messages', () => {
    fc.assert(
      fc.property(userMessageArb, (msg) => {
        const apiMessages = buildSingleShotMessages(msg);
        const assistantMessages = apiMessages.filter((m) => m.role === 'assistant');
        expect(assistantMessages).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 4: Result list reverse-chronological ordering ---
// Feature: llm-playground, Property 4: Result list reverse-chronological ordering
// **Validates: Requirements 3.5**

describe('Property 4: Result list reverse-chronological ordering', () => {
  it('after N addResult calls with increasing timestamps, results are always newest-first', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 100_000 }), { minLength: 1, maxLength: 30 }),
        (offsets) => {
          let results: PlaygroundResult[] = [];
          let baseTime = 1_000_000;

          for (let i = 0; i < offsets.length; i++) {
            // Each new result has a timestamp >= previous (simulating time passing)
            baseTime += offsets[i];
            const result = makeResult(baseTime, i);
            results = addResult(results, result);
          }

          // After all additions, the list must be reverse-chronological
          expect(isReverseChronological(results)).toBe(true);
          // First item should have the largest timestamp
          expect(results[0].timestamp).toBe(baseTime);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for all i < j in results, results[i].timestamp >= results[j].timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (count) => {
        let results: PlaygroundResult[] = [];

        for (let i = 0; i < count; i++) {
          const timestamp = Date.now() + i; // Increasing timestamps
          results = addResult(results, makeResult(timestamp, i));
        }

        // Verify the ordering invariant
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].timestamp).toBeGreaterThanOrEqual(results[i + 1].timestamp);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('results list length equals number of calls made', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (count) => {
        let results: PlaygroundResult[] = [];
        for (let i = 0; i < count; i++) {
          results = addResult(results, makeResult(Date.now() + i, i));
        }
        expect(results).toHaveLength(count);
      }),
      { numRuns: 100 },
    );
  });
});
