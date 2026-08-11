/**
 * Pure reducer for PlaygroundContext state management.
 * Extracted from the context to enable direct unit testing and property-based testing.
 *
 * No I/O, no React — pure state transitions only.
 */

import type {
  GuidanceInfo,
  PlaygroundConfig,
  PlaygroundResult,
  PlaygroundState,
} from './PlaygroundContext';

// --- Action Types ---

export type PlaygroundAction =
  | { type: 'UPDATE_CONFIG'; payload: Partial<PlaygroundConfig> }
  | { type: 'UPDATE_COMPARE_CONFIG'; payload: Partial<PlaygroundConfig> }
  | { type: 'SET_MODE'; payload: PlaygroundState['mode'] }
  | { type: 'TOGGLE_SCORING' }
  | { type: 'RESET_CONVERSATION' }
  | { type: 'ADD_USER_MESSAGE'; payload: { message: string } }
  | {
      type: 'ADD_ASSISTANT_RESPONSE';
      payload: { content: string; result: PlaygroundResult };
    }
  | { type: 'ADD_SINGLE_SHOT_RESULT'; payload: PlaygroundResult }
  | { type: 'UPDATE_SINGLE_SHOT_RESULT'; payload: PlaygroundResult }
  | {
      type: 'SET_COMPARE_RESULTS';
      payload: { left: PlaygroundResult | null; right: PlaygroundResult | null };
    }
  | { type: 'SET_COMPARE_LEFT'; payload: PlaygroundResult }
  | { type: 'SET_COMPARE_RIGHT'; payload: PlaygroundResult }
  | { type: 'SET_MULTI_TURN_SESSION_ID'; payload: string }
  | { type: 'PERSONA_CHANGED'; persona: { theme: 'playful' | 'hybrid'; locale: 'id' | 'en' } }
  | { type: 'PROMPT_AUTO_GENERATED'; systemPrompt: string; guidance: GuidanceInfo }
  | { type: 'PROMPT_MANUALLY_EDITED' }
  | { type: 'GUIDANCE_UPDATED'; guidance: GuidanceInfo }
  | { type: 'COVERAGE_UPDATED'; categories: string[] };

// --- Initial State Factory ---

export function createInitialState(config: PlaygroundConfig): PlaygroundState {
  return {
    mode: 'single-shot',
    config: { ...config },
    compareConfig: { ...config },
    results: [],
    multiTurnMessages: [],
    multiTurnSessionId: null,
    multiTurnScoring: null,
    enableScoring: false,
    compareResults: { left: null, right: null },
    persona: { theme: 'hybrid', locale: 'id' },
    promptStatus: 'custom',
    guidance: null,
    coverageAccumulator: [],
  };
}

// --- Reducer ---

export function playgroundReducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case 'UPDATE_CONFIG':
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };

    case 'UPDATE_COMPARE_CONFIG':
      return {
        ...state,
        compareConfig: { ...state.compareConfig, ...action.payload },
      };

    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
      };

    case 'TOGGLE_SCORING':
      return {
        ...state,
        enableScoring: !state.enableScoring,
      };

    case 'RESET_CONVERSATION':
      return {
        ...state,
        multiTurnMessages: [],
        multiTurnSessionId: null,
        multiTurnScoring: null,
        coverageAccumulator: [],
        guidance: null,
        // Config preserved — only messages cleared
      };

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        multiTurnMessages: [
          ...state.multiTurnMessages,
          { role: 'user' as const, content: action.payload.message },
        ],
      };

    case 'ADD_ASSISTANT_RESPONSE':
      return {
        ...state,
        multiTurnMessages: [
          ...state.multiTurnMessages,
          { role: 'assistant' as const, content: action.payload.content },
        ],
        results: [...state.results, action.payload.result],
      };

    case 'ADD_SINGLE_SHOT_RESULT':
      return {
        ...state,
        results: [action.payload, ...state.results],
      };

    case 'UPDATE_SINGLE_SHOT_RESULT':
      return {
        ...state,
        results: state.results.map((r) => (r.id === action.payload.id ? action.payload : r)),
      };

    case 'SET_COMPARE_RESULTS':
      return {
        ...state,
        compareResults: action.payload,
      };

    case 'SET_COMPARE_LEFT':
      return {
        ...state,
        compareResults: { ...state.compareResults, left: action.payload },
      };

    case 'SET_COMPARE_RIGHT':
      return {
        ...state,
        compareResults: { ...state.compareResults, right: action.payload },
      };

    case 'SET_MULTI_TURN_SESSION_ID':
      return {
        ...state,
        multiTurnSessionId: action.payload,
      };

    case 'PERSONA_CHANGED':
      return {
        ...state,
        persona: action.persona,
      };

    case 'PROMPT_AUTO_GENERATED':
      return {
        ...state,
        config: { ...state.config, systemPrompt: action.systemPrompt },
        promptStatus: 'production',
        guidance: action.guidance,
      };

    case 'PROMPT_MANUALLY_EDITED':
      return {
        ...state,
        promptStatus: 'custom',
      };

    case 'GUIDANCE_UPDATED':
      return {
        ...state,
        guidance: action.guidance,
      };

    case 'COVERAGE_UPDATED':
      return {
        ...state,
        coverageAccumulator: action.categories,
      };

    default:
      return state;
  }
}

// --- Helper: Build messages array for multi-turn API call ---

/**
 * Builds the messages array that should be sent to the API for a multi-turn call.
 * Includes all accumulated user messages and assistant responses + the new user message.
 */
export function buildMultiTurnApiMessages(
  state: PlaygroundState,
  newMessage: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return [...state.multiTurnMessages, { role: 'user' as const, content: newMessage }];
}
