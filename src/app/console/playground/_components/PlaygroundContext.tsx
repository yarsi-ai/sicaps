'use client';

import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import {
  playgroundReducer,
  createInitialState,
  buildMultiTurnApiMessages,
} from './playgroundReducer';
import {
  savePreset as savePresetToStorage,
  loadPreset as loadPresetFromStorage,
  deletePreset as deletePresetFromStorage,
  listPresets as listPresetsFromStorage,
} from './playground-presets';
import { updateCoverage } from './playground-coverage';
import { getDefaultModel } from '@/lib/llm/playground-client';
import { buildSystemMessage } from '@/features/screening-chat-v1/internal';

// --- Types ---

export type PlaygroundProvider = 'groq' | 'huggingface' | 'gemini' | 'ollama';

export interface PlaygroundConfig {
  provider: PlaygroundProvider;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface PresetEntry {
  name: string;
  config: PlaygroundConfig;
  createdAt: string;
}

export interface PlaygroundResult {
  id: string;
  input: string;
  config: PlaygroundConfig;
  response: PlaygroundResponse | null;
  error: string | null;
  loading: boolean;
  timestamp: number;
}

export interface PlaygroundResponse {
  reply: string;
  extraction: Record<string, Array<{ keyword: string; confidence: string | number }>> | null;
  scoring: {
    version: string;
    totalScore: number;
    riskLevel: string;
    scores: Record<
      string,
      {
        raw: number;
        capped: number;
        status: string;
        matchedPatterns: string[];
        unmatchedKeywords: string[];
      }
    >;
  } | null;
  metadata: {
    latencyMs: number;
    model: string;
    tokensUsed: { input: number; output: number } | null;
    provider: string;
  };
  sessionId: string;
  turnNumber: number;
}

export interface GuidanceInfo {
  instruction: string;
  targetCategory: string | null;
  isFollowUp: boolean;
  reason: string;
}

export interface PlaygroundState {
  mode: 'single-shot' | 'multi-turn' | 'compare';
  config: PlaygroundConfig;
  compareConfig: PlaygroundConfig;
  results: PlaygroundResult[];
  multiTurnMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  multiTurnSessionId: string | null;
  multiTurnScoring: {
    totalScore: number | null;
    riskLevel: string | null;
    categoriesCovered: string[];
    categoriesRemaining: string[];
  } | null;
  enableScoring: boolean;
  compareResults: { left: PlaygroundResult | null; right: PlaygroundResult | null };
  persona: {
    theme: 'playful' | 'hybrid';
    locale: 'id' | 'en';
  };
  promptStatus: 'production' | 'custom';
  guidance: GuidanceInfo | null;
  coverageAccumulator: string[];
}

export interface PlaygroundContextValue {
  state: PlaygroundState;
  updateConfig: (partial: Partial<PlaygroundConfig>) => void;
  updateCompareConfig: (partial: Partial<PlaygroundConfig>) => void;
  setMode: (mode: PlaygroundState['mode']) => void;
  sendMessage: (message: string) => Promise<void>;
  resetConversation: () => void;
  toggleScoring: () => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
  listPresets: () => PresetEntry[];
  updatePersona: (theme: 'playful' | 'hybrid', locale: 'id' | 'en') => Promise<void>;
  resetToProduction: () => Promise<void>;
  markPromptEdited: () => void;
}

// --- Context ---

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export function usePlaygroundContext(): PlaygroundContextValue {
  const ctx = useContext(PlaygroundContext);
  if (!ctx) throw new Error('usePlaygroundContext must be used within PlaygroundProvider');
  return ctx;
}

// --- Default Config ---

/** Default demographics for playground prompt generation.
 * Can be made configurable in a future iteration via PersonaSelector expansion. */
const PLAYGROUND_DEMOGRAPHICS = { age: 16, gender: 'male' } as const;

/** Production system prompt for a representative session (pre-fill for playground) */
const PRODUCTION_SYSTEM_PROMPT = buildSystemMessage({
  theme: 'hybrid',
  locale: 'id',
  turn: 1,
  demographics: PLAYGROUND_DEMOGRAPHICS,
  categoriesCovered: [],
  categoriesRemaining: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
});

export const DEFAULT_CONFIG: PlaygroundConfig = {
  provider: 'groq',
  model: getDefaultModel('groq'),
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 2048,
  systemPrompt: PRODUCTION_SYSTEM_PROMPT,
};

// --- LocalStorage key ---
export const PRESETS_STORAGE_KEY = 'sicaps-playground-presets';

// --- API Call ---

async function callPlaygroundApi(
  config: PlaygroundConfig,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options: { enableScoring: boolean; mode: string; sessionId?: string },
): Promise<PlaygroundResponse> {
  const res = await fetch('/api/console/playground/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
      messages,
      enableScoring: options.enableScoring,
      locale: 'id',
      mode: options.mode,
      sessionId: options.sessionId,
    }),
  });

  const json = await res.json();

  if (!res.ok || json.error) {
    const errorMsg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

// --- Provider ---

export function PlaygroundContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playgroundReducer, DEFAULT_CONFIG, createInitialState);

  const updateConfig = useCallback((partial: Partial<PlaygroundConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: partial });
  }, []);

  const updateCompareConfig = useCallback((partial: Partial<PlaygroundConfig>) => {
    dispatch({ type: 'UPDATE_COMPARE_CONFIG', payload: partial });
  }, []);

  const setMode = useCallback((mode: PlaygroundState['mode']) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  const toggleScoring = useCallback(() => {
    dispatch({ type: 'TOGGLE_SCORING' });
  }, []);

  const resetConversation = useCallback(() => {
    dispatch({ type: 'RESET_CONVERSATION' });
  }, []);

  const getSingleShotSessionId = useCallback((): string | undefined => {
    // Find the most recent single-shot result with a sessionId to reuse as scratch
    const latestWithSession = state.results.find((r) => r.response?.sessionId);
    return latestWithSession?.response?.sessionId;
  }, [state.results]);

  const sendSingleShot = useCallback(
    async (message: string): Promise<void> => {
      const resultId = crypto.randomUUID();
      const loadingResult: PlaygroundResult = {
        id: resultId,
        input: message,
        config: { ...state.config },
        response: null,
        error: null,
        loading: true,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_SINGLE_SHOT_RESULT', payload: loadingResult });

      try {
        const response = await callPlaygroundApi(
          state.config,
          [{ role: 'user', content: message }],
          {
            enableScoring: state.enableScoring,
            mode: 'single-shot',
            // Reuse scratch session if we have one from a previous single-shot result
            sessionId: getSingleShotSessionId(),
          },
        );

        const completedResult: PlaygroundResult = {
          ...loadingResult,
          response,
          loading: false,
          timestamp: Date.now(),
        };
        // Replace loading result with completed
        dispatch({ type: 'UPDATE_SINGLE_SHOT_RESULT', payload: completedResult });
      } catch (err) {
        const errorResult: PlaygroundResult = {
          ...loadingResult,
          error: err instanceof Error ? err.message : 'Unknown error',
          loading: false,
          timestamp: Date.now(),
        };
        dispatch({ type: 'UPDATE_SINGLE_SHOT_RESULT', payload: errorResult });
      }
    },
    [state.config, state.enableScoring, getSingleShotSessionId],
  );

  const sendMultiTurn = useCallback(
    async (message: string): Promise<void> => {
      dispatch({ type: 'ADD_USER_MESSAGE', payload: { message } });

      const apiMessages = buildMultiTurnApiMessages(state, message);

      try {
        const response = await callPlaygroundApi(state.config, apiMessages, {
          enableScoring: state.enableScoring,
          mode: 'multi-turn',
          sessionId: state.multiTurnSessionId ?? undefined,
        });

        // Save session ID from first response
        if (!state.multiTurnSessionId) {
          dispatch({ type: 'SET_MULTI_TURN_SESSION_ID', payload: response.sessionId });
        }

        const result: PlaygroundResult = {
          id: crypto.randomUUID(),
          input: message,
          config: { ...state.config },
          response,
          error: null,
          loading: false,
          timestamp: Date.now(),
        };

        dispatch({
          type: 'ADD_ASSISTANT_RESPONSE',
          payload: { content: response.reply, result },
        });

        // Update coverage accumulator from extraction results
        const updatedCoverage = updateCoverage(state.coverageAccumulator, response.extraction);
        dispatch({ type: 'COVERAGE_UPDATED', categories: updatedCoverage });

        // Auto-refresh guidance after coverage update (task 10.4)
        try {
          const allCategories = [
            'intensitas',
            'waktu',
            'lokasi_tubuh',
            'kontak',
            'lesi',
            'faktor_risiko',
          ];
          const categoriesRemaining = allCategories.filter((c) => !updatedCoverage.includes(c));
          const currentTurn = state.multiTurnMessages.filter((m) => m.role === 'user').length + 1;

          const promptRes = await fetch('/api/console/playground/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              theme: state.persona.theme,
              locale: state.persona.locale,
              turn: currentTurn + 1, // next turn's guidance
              demographics: PLAYGROUND_DEMOGRAPHICS,
              categoriesCovered: updatedCoverage,
              categoriesRemaining,
            }),
          });
          const promptJson = await promptRes.json();
          if (promptRes.ok) {
            dispatch({ type: 'GUIDANCE_UPDATED', guidance: promptJson.data.guidance });
          }
        } catch {
          // Guidance refresh failure is non-critical, don't crash the flow
        }
      } catch (err) {
        // On error, add error as assistant message
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const result: PlaygroundResult = {
          id: crypto.randomUUID(),
          input: message,
          config: { ...state.config },
          response: null,
          error: errorMsg,
          loading: false,
          timestamp: Date.now(),
        };
        dispatch({
          type: 'ADD_ASSISTANT_RESPONSE',
          payload: { content: `Error: ${errorMsg}`, result },
        });
      }
    },
    [state],
  );

  const sendCompare = useCallback(
    async (message: string): Promise<void> => {
      const makeResult = (config: PlaygroundConfig): PlaygroundResult => ({
        id: crypto.randomUUID(),
        input: message,
        config: { ...config },
        response: null,
        error: null,
        loading: true,
        timestamp: Date.now(),
      });

      const leftResult = makeResult(state.config);
      const rightResult = makeResult(state.compareConfig);

      dispatch({ type: 'SET_COMPARE_RESULTS', payload: { left: leftResult, right: rightResult } });

      const callLeft = callPlaygroundApi(state.config, [{ role: 'user', content: message }], {
        enableScoring: state.enableScoring,
        mode: 'compare',
      });

      const callRight = callPlaygroundApi(
        state.compareConfig,
        [{ role: 'user', content: message }],
        { enableScoring: state.enableScoring, mode: 'compare' },
      );

      // Fire both calls independently
      callLeft
        .then((response) => {
          dispatch({
            type: 'SET_COMPARE_LEFT',
            payload: { ...leftResult, response, loading: false, timestamp: Date.now() },
          });
        })
        .catch((err) => {
          dispatch({
            type: 'SET_COMPARE_LEFT',
            payload: {
              ...leftResult,
              error: err instanceof Error ? err.message : 'Error',
              loading: false,
            },
          });
        });

      callRight
        .then((response) => {
          dispatch({
            type: 'SET_COMPARE_RIGHT',
            payload: { ...rightResult, response, loading: false, timestamp: Date.now() },
          });
        })
        .catch((err) => {
          dispatch({
            type: 'SET_COMPARE_RIGHT',
            payload: {
              ...rightResult,
              error: err instanceof Error ? err.message : 'Error',
              loading: false,
            },
          });
        });
    },
    [state.config, state.compareConfig, state.enableScoring],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      if (state.mode === 'single-shot') {
        await sendSingleShot(message);
      } else if (state.mode === 'multi-turn') {
        await sendMultiTurn(message);
      } else {
        await sendCompare(message);
      }
    },
    [state.mode, sendSingleShot, sendMultiTurn, sendCompare],
  );

  // --- Preset Management ---

  const savePreset = useCallback(
    (name: string) => {
      savePresetToStorage(name, state.config);
    },
    [state.config],
  );

  const loadPreset = useCallback((name: string) => {
    if (name === '__default__') {
      dispatch({ type: 'UPDATE_CONFIG', payload: DEFAULT_CONFIG });
      return;
    }
    const config = loadPresetFromStorage(name);
    if (config) {
      dispatch({ type: 'UPDATE_CONFIG', payload: config });
    }
  }, []);

  const deletePreset = useCallback((name: string) => {
    deletePresetFromStorage(name);
  }, []);

  const listPresets = useCallback((): PresetEntry[] => {
    return listPresetsFromStorage();
  }, []);

  // --- Persona & Prompt Management ---

  const fetchProductionPrompt = useCallback(
    async (
      persona: { theme: 'playful' | 'hybrid'; locale: 'id' | 'en' },
      turn: number,
      coverage: string[],
    ): Promise<{ systemPrompt: string; guidance: GuidanceInfo }> => {
      const allCategories = [
        'intensitas',
        'waktu',
        'lokasi_tubuh',
        'kontak',
        'lesi',
        'faktor_risiko',
      ];
      const categoriesRemaining = allCategories.filter((c) => !coverage.includes(c));

      const res = await fetch('/api/console/playground/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: persona.theme,
          locale: persona.locale,
          turn,
          demographics: PLAYGROUND_DEMOGRAPHICS,
          categoriesCovered: coverage,
          categoriesRemaining,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to generate prompt');
      return json.data;
    },
    [],
  );

  const updatePersona = useCallback(
    async (theme: 'playful' | 'hybrid', locale: 'id' | 'en'): Promise<void> => {
      dispatch({ type: 'PERSONA_CHANGED', persona: { theme, locale } });

      const turn =
        state.mode === 'multi-turn'
          ? state.multiTurnMessages.filter((m) => m.role === 'user').length + 1
          : 1;
      const coverage = state.mode === 'multi-turn' ? state.coverageAccumulator : [];

      try {
        const { systemPrompt, guidance } = await fetchProductionPrompt(
          { theme, locale },
          turn,
          coverage,
        );
        dispatch({ type: 'PROMPT_AUTO_GENERATED', systemPrompt, guidance });
      } catch {
        // Keep current prompt on error — persona state already updated
      }
    },
    [state.mode, state.multiTurnMessages, state.coverageAccumulator, fetchProductionPrompt],
  );

  const resetToProduction = useCallback(async (): Promise<void> => {
    const turn =
      state.mode === 'multi-turn'
        ? state.multiTurnMessages.filter((m) => m.role === 'user').length + 1
        : 1;
    const coverage = state.mode === 'multi-turn' ? state.coverageAccumulator : [];

    try {
      const { systemPrompt, guidance } = await fetchProductionPrompt(state.persona, turn, coverage);
      dispatch({ type: 'PROMPT_AUTO_GENERATED', systemPrompt, guidance });
    } catch {
      // Keep current prompt on error
    }
  }, [
    state.mode,
    state.multiTurnMessages,
    state.coverageAccumulator,
    state.persona,
    fetchProductionPrompt,
  ]);

  const markPromptEdited = useCallback((): void => {
    if (state.promptStatus === 'production') {
      dispatch({ type: 'PROMPT_MANUALLY_EDITED' });
    }
  }, [state.promptStatus]);

  const contextValue: PlaygroundContextValue = {
    state,
    updateConfig,
    updateCompareConfig,
    setMode,
    sendMessage,
    resetConversation,
    toggleScoring,
    savePreset,
    loadPreset,
    deletePreset,
    listPresets,
    updatePersona,
    resetToProduction,
    markPromptEdited,
  };

  return <PlaygroundContext.Provider value={contextValue}>{children}</PlaygroundContext.Provider>;
}
