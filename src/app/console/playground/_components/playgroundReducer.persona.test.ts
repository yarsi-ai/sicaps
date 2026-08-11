import { describe, it, expect } from 'vitest';
import { playgroundReducer, createInitialState } from './playgroundReducer';
import type { PlaygroundConfig, GuidanceInfo } from './PlaygroundContext';

const DEFAULT_CONFIG: PlaygroundConfig = {
  provider: 'groq',
  model: 'test-model',
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 2048,
  systemPrompt: 'initial prompt',
};

const sampleGuidance: GuidanceInfo = {
  instruction: 'EXPLORE',
  targetCategory: 'intensitas',
  isFollowUp: false,
  reason: 'intensitas belum covered',
};

describe('playgroundReducer — persona/guidance actions', () => {
  it('PERSONA_CHANGED updates persona state', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const result = playgroundReducer(state, {
      type: 'PERSONA_CHANGED',
      persona: { theme: 'playful', locale: 'en' },
    });
    expect(result.persona).toEqual({ theme: 'playful', locale: 'en' });
  });

  it('PROMPT_AUTO_GENERATED sets systemPrompt, promptStatus, and guidance', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const result = playgroundReducer(state, {
      type: 'PROMPT_AUTO_GENERATED',
      systemPrompt: 'new generated prompt',
      guidance: sampleGuidance,
    });
    expect(result.config.systemPrompt).toBe('new generated prompt');
    expect(result.promptStatus).toBe('production');
    expect(result.guidance).toEqual(sampleGuidance);
  });

  it('PROMPT_MANUALLY_EDITED sets promptStatus to custom', () => {
    const state = { ...createInitialState(DEFAULT_CONFIG), promptStatus: 'production' as const };
    const result = playgroundReducer(state, { type: 'PROMPT_MANUALLY_EDITED' });
    expect(result.promptStatus).toBe('custom');
  });

  it('GUIDANCE_UPDATED replaces guidance state', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const newGuidance: GuidanceInfo = {
      instruction: 'FOLLOW_UP',
      targetCategory: 'waktu',
      isFollowUp: true,
      reason: 'Follow-up waktu — butuh detail lebih',
    };
    const result = playgroundReducer(state, { type: 'GUIDANCE_UPDATED', guidance: newGuidance });
    expect(result.guidance).toEqual(newGuidance);
  });

  it('COVERAGE_UPDATED sets coverageAccumulator', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const result = playgroundReducer(state, {
      type: 'COVERAGE_UPDATED',
      categories: ['intensitas', 'waktu'],
    });
    expect(result.coverageAccumulator).toEqual(['intensitas', 'waktu']);
  });

  it('RESET_CONVERSATION clears coverageAccumulator and guidance', () => {
    const state = {
      ...createInitialState(DEFAULT_CONFIG),
      coverageAccumulator: ['intensitas', 'waktu'],
      guidance: sampleGuidance,
      multiTurnMessages: [{ role: 'user' as const, content: 'hello' }],
    };
    const result = playgroundReducer(state, { type: 'RESET_CONVERSATION' });
    expect(result.coverageAccumulator).toEqual([]);
    expect(result.guidance).toBeNull();
    expect(result.multiTurnMessages).toEqual([]);
  });
});
