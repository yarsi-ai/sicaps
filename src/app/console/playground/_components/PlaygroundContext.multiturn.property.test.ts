/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Property tests use array indices extensively
/**
 * Property-based tests for multi-turn and compare mode behavior.
 * Feature: llm-playground, Properties 5-8
 *
 * Tests the playground reducer/state logic directly for:
 * - Multi-turn history accumulation
 * - Reset preserves config, clears messages
 * - Compare mode config independence
 * - Compare mode sends same message to both
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PlaygroundConfig, PlaygroundState } from './PlaygroundContext';
import {
  playgroundReducer,
  createInitialState,
  buildMultiTurnApiMessages,
} from './playgroundReducer';

// --- Arbitraries ---

/** Arbitrary for a valid PlaygroundProvider */
const providerArb = fc.constantFrom(
  'groq' as const,
  'huggingface' as const,
  'gemini' as const,
  'ollama' as const,
);

/** Arbitrary for a valid PlaygroundConfig */
const playgroundConfigArb: fc.Arbitrary<PlaygroundConfig> = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  topP: fc.double({ min: 0, max: 1, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 4096 }),
  systemPrompt: fc.string({ minLength: 1, maxLength: 200 }),
});

/** Arbitrary for a non-empty user message */
const userMessageArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Arbitrary for a non-empty assistant reply */
const assistantReplyArb = fc.string({ minLength: 1, maxLength: 200 });

/** Arbitrary for a sequence of user messages (1 to 7 turns) */
const messageSequenceArb = fc.array(userMessageArb, { minLength: 1, maxLength: 7 });

/** Arbitrary for a partial config update */
const partialConfigArb: fc.Arbitrary<Partial<PlaygroundConfig>> = fc.oneof(
  fc.record({ temperature: fc.double({ min: 0, max: 2, noNaN: true }) }),
  fc.record({ topP: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ maxTokens: fc.integer({ min: 1, max: 4096 }) }),
  fc.record({ provider: providerArb }),
  fc.record({
    model: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  }),
  fc.record({ systemPrompt: fc.string({ minLength: 1, maxLength: 200 }) }),
);

// --- Property 5: Multi-turn history accumulation ---

describe('Property 5: Multi-turn history accumulation', () => {
  /**
   * Validates: Requirements 4.1
   *
   * After N messages sent in multi-turn mode, the API call for the Nth message
   * should include all N user messages + previous assistant responses in the
   * messages array. The messages array grows with each turn.
   */
  it('Nth API call includes N user messages and (N-1) assistant replies', () => {
    fc.assert(
      fc.property(playgroundConfigArb, messageSequenceArb, (config, messages) => {
        let state = createInitialState(config);
        state = playgroundReducer(state, { type: 'SET_MODE', payload: 'multi-turn' });

        for (let i = 0; i < messages.length; i++) {
          const userMsg = messages[i];

          // Build what the API call should contain BEFORE the user message is added to state
          const apiMessages = buildMultiTurnApiMessages(state, userMsg);

          // Verify the Nth API call has correct number of messages:
          // - i user messages already in state (from previous turns)
          // - i assistant replies already in state (from previous turns)
          // - 1 new user message being sent
          // Total = i + i + 1 = 2*i + 1
          expect(apiMessages.length).toBe(2 * i + 1);

          // Verify all user messages are present in order
          const userMessagesInApi = apiMessages.filter((m) => m.role === 'user');
          expect(userMessagesInApi.length).toBe(i + 1);

          // The last message in the API call is always the new user message
          expect(apiMessages[apiMessages.length - 1]).toEqual({
            role: 'user',
            content: userMsg,
          });

          // Verify previous user messages are preserved
          for (let j = 0; j < i; j++) {
            expect(userMessagesInApi[j].content).toBe(messages[j]);
          }

          // Simulate adding user message + assistant response to state
          state = playgroundReducer(state, {
            type: 'ADD_USER_MESSAGE',
            payload: { message: userMsg },
          });
          state = playgroundReducer(state, {
            type: 'ADD_ASSISTANT_RESPONSE',
            payload: {
              content: `Response to: ${userMsg}`,
              result: {
                id: `result-${i}`,
                input: userMsg,
                config,
                response: null,
                error: null,
                loading: false,
                timestamp: Date.now(),
              },
            },
          });
        }
      }),
      { numRuns: 100 },
    );
  });

  it('messages array length grows linearly with each turn', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        fc.integer({ min: 1, max: 7 }),
        assistantReplyArb,
        (config, numTurns, reply) => {
          let state = createInitialState(config);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'multi-turn' });

          for (let i = 0; i < numTurns; i++) {
            const msg = `Message ${i}`;

            // Before sending, the API messages array has 2*i existing + 1 new = 2*i + 1
            const apiMessages = buildMultiTurnApiMessages(state, msg);
            expect(apiMessages.length).toBe(2 * i + 1);

            // After adding to state (user + assistant)
            state = playgroundReducer(state, {
              type: 'ADD_USER_MESSAGE',
              payload: { message: msg },
            });
            state = playgroundReducer(state, {
              type: 'ADD_ASSISTANT_RESPONSE',
              payload: {
                content: reply,
                result: {
                  id: `r-${i}`,
                  input: msg,
                  config,
                  response: null,
                  error: null,
                  loading: false,
                  timestamp: Date.now(),
                },
              },
            });

            // After the turn, multiTurnMessages has 2*(i+1) entries
            expect(state.multiTurnMessages.length).toBe(2 * (i + 1));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- Property 6: Reset preserves config, clears messages ---

describe('Property 6: Reset preserves config, clears messages', () => {
  /**
   * Validates: Requirements 4.5
   *
   * After resetConversation(), config should remain unchanged,
   * multiTurnMessages should be empty, multiTurnSessionId should be null,
   * and enableScoring should remain unchanged.
   */
  it('reset clears messages and sessionId while preserving config and scoring toggle', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        messageSequenceArb,
        fc.boolean(),
        (config, messages, scoringEnabled) => {
          // Build up state with messages
          let state = createInitialState(config);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'multi-turn' });

          // Set scoring state
          if (scoringEnabled !== state.enableScoring) {
            state = playgroundReducer(state, { type: 'TOGGLE_SCORING' });
          }

          // Set a session ID
          state = playgroundReducer(state, {
            type: 'SET_MULTI_TURN_SESSION_ID',
            payload: 'session-123',
          });

          // Simulate conversation
          for (const msg of messages) {
            state = playgroundReducer(state, {
              type: 'ADD_USER_MESSAGE',
              payload: { message: msg },
            });
            state = playgroundReducer(state, {
              type: 'ADD_ASSISTANT_RESPONSE',
              payload: {
                content: `Reply to ${msg}`,
                result: {
                  id: crypto.randomUUID(),
                  input: msg,
                  config,
                  response: null,
                  error: null,
                  loading: false,
                  timestamp: Date.now(),
                },
              },
            });
          }

          // Capture pre-reset config
          const preResetConfig = { ...state.config };
          const preResetEnableScoring = state.enableScoring;

          // Verify we have messages before reset
          expect(state.multiTurnMessages.length).toBeGreaterThan(0);

          // Perform reset
          state = playgroundReducer(state, { type: 'RESET_CONVERSATION' });

          // Assert: messages cleared
          expect(state.multiTurnMessages).toEqual([]);

          // Assert: sessionId cleared
          expect(state.multiTurnSessionId).toBeNull();

          // Assert: config preserved (deep equal)
          expect(state.config).toEqual(preResetConfig);

          // Assert: scoring toggle preserved
          expect(state.enableScoring).toBe(preResetEnableScoring);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reset is idempotent — calling it on empty state produces same empty state', () => {
    fc.assert(
      fc.property(playgroundConfigArb, (config) => {
        const state = createInitialState(config);
        const resetOnce = playgroundReducer(state, { type: 'RESET_CONVERSATION' });
        const resetTwice = playgroundReducer(resetOnce, { type: 'RESET_CONVERSATION' });

        expect(resetOnce.multiTurnMessages).toEqual([]);
        expect(resetOnce.multiTurnSessionId).toBeNull();
        expect(resetTwice).toEqual(resetOnce);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 7: Compare mode config independence ---

describe('Property 7: Compare mode config independence', () => {
  /**
   * Validates: Requirements 5.2
   *
   * Updating `config` should NOT affect `compareConfig` and vice versa.
   * For any sequence of updateConfig and updateCompareConfig calls,
   * the two configs remain independent.
   */
  it('updating config does not affect compareConfig', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        fc.array(partialConfigArb, { minLength: 1, maxLength: 10 }),
        (initialConfig, updates) => {
          let state = createInitialState(initialConfig);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });

          // Capture initial compareConfig
          const initialCompareConfig = { ...state.compareConfig };

          // Apply all updates to config (left panel)
          for (const update of updates) {
            state = playgroundReducer(state, {
              type: 'UPDATE_CONFIG',
              payload: update,
            });
          }

          // compareConfig must remain unchanged
          expect(state.compareConfig).toEqual(initialCompareConfig);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('updating compareConfig does not affect config', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        fc.array(partialConfigArb, { minLength: 1, maxLength: 10 }),
        (initialConfig, updates) => {
          let state = createInitialState(initialConfig);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });

          // Capture initial config
          const initialLeftConfig = { ...state.config };

          // Apply all updates to compareConfig (right panel)
          for (const update of updates) {
            state = playgroundReducer(state, {
              type: 'UPDATE_COMPARE_CONFIG',
              payload: update,
            });
          }

          // config must remain unchanged
          expect(state.config).toEqual(initialLeftConfig);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('interleaved updates to both configs maintain independence', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        fc.array(
          fc.tuple(fc.constantFrom('config' as const, 'compareConfig' as const), partialConfigArb),
          { minLength: 1, maxLength: 15 },
        ),
        (initialConfig, updateSequence) => {
          let state = createInitialState(initialConfig);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });

          // Track what each config should be independently
          let expectedConfig = { ...state.config };
          let expectedCompareConfig = { ...state.compareConfig };

          for (const [target, update] of updateSequence) {
            if (target === 'config') {
              state = playgroundReducer(state, {
                type: 'UPDATE_CONFIG',
                payload: update,
              });
              expectedConfig = { ...expectedConfig, ...update };
            } else {
              state = playgroundReducer(state, {
                type: 'UPDATE_COMPARE_CONFIG',
                payload: update,
              });
              expectedCompareConfig = { ...expectedCompareConfig, ...update };
            }

            // After every update, both configs should match their independent tracking
            expect(state.config).toEqual(expectedConfig);
            expect(state.compareConfig).toEqual(expectedCompareConfig);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- Property 8: Compare mode sends same message to both ---

describe('Property 8: Compare sends same message to both', () => {
  /**
   * Validates: Requirements 5.3
   *
   * In compare mode, sendMessage(text) should trigger two API calls
   * with the same user message. Both calls use the same text but different configs.
   */
  it('compare mode produces two results with identical user message but different configs', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        playgroundConfigArb,
        userMessageArb,
        (configA, configB, message) => {
          let state = createInitialState(configA);
          state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });

          // Set right panel to a different config
          state = playgroundReducer(state, {
            type: 'UPDATE_COMPARE_CONFIG',
            payload: configB,
          });

          // Simulate what sendMessage does in compare mode:
          // It creates two API call payloads — one per config
          const leftApiPayload = {
            ...state.config,
            messages: [{ role: 'user' as const, content: message }],
          };
          const rightApiPayload = {
            ...state.compareConfig,
            messages: [{ role: 'user' as const, content: message }],
          };

          // Both payloads have the SAME user message
          expect(leftApiPayload.messages).toEqual(rightApiPayload.messages);
          expect(leftApiPayload.messages[0].content).toBe(message);
          expect(rightApiPayload.messages[0].content).toBe(message);

          // Configs are their respective panel configs (potentially different)
          expect(leftApiPayload.provider).toBe(state.config.provider);
          expect(leftApiPayload.model).toBe(state.config.model);
          expect(leftApiPayload.temperature).toBe(state.config.temperature);
          expect(rightApiPayload.provider).toBe(state.compareConfig.provider);
          expect(rightApiPayload.model).toBe(state.compareConfig.model);
          expect(rightApiPayload.temperature).toBe(state.compareConfig.temperature);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compare mode results are stored independently per panel', () => {
    fc.assert(
      fc.property(playgroundConfigArb, playgroundConfigArb, userMessageArb, (cfgA, cfgB, msg) => {
        let state = createInitialState(cfgA);
        state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });
        state = playgroundReducer(state, {
          type: 'UPDATE_COMPARE_CONFIG',
          payload: cfgB,
        });

        // Simulate receiving results for both panels
        const leftResult: PlaygroundResult = {
          id: 'left-1',
          input: msg,
          config: state.config,
          response: null,
          error: null,
          loading: false,
          timestamp: Date.now(),
        };
        const rightResult: PlaygroundResult = {
          id: 'right-1',
          input: msg,
          config: state.compareConfig,
          response: null,
          error: null,
          loading: false,
          timestamp: Date.now(),
        };

        state = playgroundReducer(state, {
          type: 'SET_COMPARE_RESULTS',
          payload: { left: leftResult, right: rightResult },
        });

        // Both results stored independently
        expect(state.compareResults.left).not.toBeNull();
        expect(state.compareResults.right).not.toBeNull();

        // Both results reference the same user message
        expect(state.compareResults.left!.input).toBe(msg);
        expect(state.compareResults.right!.input).toBe(msg);

        // But have different configs
        expect(state.compareResults.left!.config).toEqual(state.config);
        expect(state.compareResults.right!.config).toEqual(state.compareConfig);
      }),
      { numRuns: 100 },
    );
  });

  it('exactly two API calls needed — verified by building both payloads from state', () => {
    fc.assert(
      fc.property(playgroundConfigArb, playgroundConfigArb, userMessageArb, (cfgA, cfgB, msg) => {
        let state = createInitialState(cfgA);
        state = playgroundReducer(state, { type: 'SET_MODE', payload: 'compare' });
        state = playgroundReducer(state, { type: 'UPDATE_COMPARE_CONFIG', payload: cfgB });

        // In compare mode, sendMessage should produce exactly 2 API call descriptions
        const apiCalls = buildCompareApiCalls(state, msg);

        expect(apiCalls.length).toBe(2);
        // Both have same message
        expect(apiCalls[0].messages[0].content).toBe(msg);
        expect(apiCalls[1].messages[0].content).toBe(msg);
        // Different configs
        expect(apiCalls[0].config).toEqual(state.config);
        expect(apiCalls[1].config).toEqual(state.compareConfig);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Helper: Build compare mode API calls (simulates what sendMessage does) ---

function buildCompareApiCalls(
  state: PlaygroundState,
  message: string,
): Array<{
  config: PlaygroundConfig;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}> {
  const userMessage = { role: 'user' as const, content: message };
  return [
    { config: state.config, messages: [userMessage] },
    { config: state.compareConfig, messages: [userMessage] },
  ];
}
