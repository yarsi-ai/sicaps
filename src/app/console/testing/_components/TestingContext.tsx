'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import { selectTheme } from '@/features/screening-chat-v1/internal';
import type { EducationLevelInput } from '@/features/screening-chat-v1/internal';
import type { ScoringEndpointResponse, ScoringTurnData } from '@/types';

// --- Types ---

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  turnNumber?: number;
}

export interface ScoringData {
  totalScore: number | null;
  riskLevel: string | null;
  categoriesCovered: string[];
  categoriesRemaining: string[];
}

/** Binary scoring state from SSE `scoring` event (v2 binary algorithm) */
export interface BinaryScoringState {
  gatalMalam: boolean;
  kontakSerupa: boolean;
  lokasiKhas: boolean;
  asrama: boolean;
  tukarAlat: boolean;
}

export type BinaryRiskLevel = 'HIGH' | 'MODERATE' | 'LOW';

export type ChipsType = 'kontak' | 'lokasi' | 'asrama' | 'tukar_alat';

export interface TurnLog {
  id: string;
  turnNumber: number;
  userMessage: string;
  rawResponse: string;
  parseStatus: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
  parseError: string | null;
  systemMessage: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokenUsage: { input: number; output: number } | null;
  retryCount: number;
}

export interface TurnDetail {
  turnNumber: number;
  log: TurnLog;
  extraction: Record<string, Array<{ keyword: string; confidence: string | number }>> | null;
  scores: Record<string, { raw?: number; capped?: number; score?: number }> | null;
  feedback: { isAccurate: boolean; notes: string | null } | null;
}

export interface SessionListItem {
  id: string;
  status: string;
  createdAt: string;
  source: string;
  riskLevel: string | null;
  totalScore: number | null;
  messageCount: number;
}

export type ConnectionStatus = 'connected' | 'streaming' | 'error' | 'checking';

export interface SessionProfile {
  age: number;
  gender: 'male' | 'female';
  educationLevel: 'ELEMENTARY' | 'JUNIOR_HIGH' | 'SENIOR_HIGH';
  locale: 'id' | 'en';
}

export interface TestingState {
  sessionId: string | null;
  messages: Message[];
  scoring: ScoringData | null;
  turns: TurnDetail[];
  selectedTurn: number | null;
  streaming: boolean;
  error: string | null;
  errorCode: string | null;
  sessions: SessionListItem[];
  connectionStatus: ConnectionStatus;
  promptVersion: string;
  inspectorOpen: boolean;
  // Console v2 — Observability state
  sessionStatus: 'IN_PROGRESS' | 'COMPLETED' | null;
  sessionMode: string | null;
  sessionMetadata: Record<string, unknown> | null;
  perception: string | null;
  theme: 'playful' | 'hybrid' | null;
  output: {
    conclusion: string | null;
    perceptionResponse: string | null;
    recommendation: string | null;
    suggestion: string | null;
  } | null;
  categoryScores: Record<string, number> | null;
  // Console v2 — Binary scoring (scoring-v2-amendment)
  binaryScoringState: BinaryScoringState | null;
  binaryRiskLevel: BinaryRiskLevel | null;
  chipsAnswered: ChipsType[];
  chipsRequest: ChipsRequestData | null;
  dimensiTerisi: string[];
  dimensiBelum: string[];
  dimensiDetail: Record<string, { keywords: string[]; negasi: string[] }>;
  phase: string | null;
}

/** Chips request payload from SSE event */
export interface ChipsRequestData {
  id: string;
  type: 'single' | 'multi';
  question: string;
  options: Array<{ token: string; label: string; group?: string }>;
  allowFreeText: boolean;
  groups?: Array<{
    id: string;
    question: string;
    options: Array<{ token: string; label: string }>;
  }>;
}

type TestingAction =
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_CHUNK'; text: string }
  | { type: 'STREAM_COMPLETE'; scoring: ScoringData; turns: TurnDetail[] }
  | { type: 'STREAM_ERROR'; error: string; code?: string }
  | { type: 'MESSAGE_SENT'; content: string }
  | { type: 'FEEDBACK_SAVED'; turnNumber: number; isAccurate: boolean; notes: string | null }
  | { type: 'SELECT_TURN'; turnNumber: number }
  | { type: 'SESSIONS_LOADED'; sessions: SessionListItem[] }
  | { type: 'CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'TOGGLE_INSPECTOR' }
  | {
      type: 'RECONNECT';
      sessionId: string;
      messages: Message[];
      scoring: ScoringData | null;
      turns: TurnDetail[];
    }
  | {
      type: 'SESSION_CONTEXT_LOADED';
      sessionStatus: 'IN_PROGRESS' | 'COMPLETED' | null;
      sessionMode: string | null;
      sessionMetadata: Record<string, unknown> | null;
      perception: string | null;
      theme: 'playful' | 'hybrid' | 'formal' | null;
      output: {
        conclusion: string | null;
        perceptionResponse: string | null;
        recommendation: string | null;
        suggestion: string | null;
      } | null;
      categoryScores: Record<string, number> | null;
    }
  | {
      type: 'BINARY_SCORING_UPDATE';
      state: BinaryScoringState;
      riskLevel: BinaryRiskLevel;
      chipsAnswered?: ChipsType[];
    }
  | { type: 'CHIPS_REQUEST'; request: ChipsRequestData | null }
  | {
      type: 'DIMENSION_UPDATE';
      dimensiTerisi: string[];
      dimensiBelum: string[];
      dimensiDetail: Record<string, { keywords: string[]; negasi: string[] }>;
    }
  | { type: 'PHASE_UPDATE'; phase: string }
  | { type: 'GREETING_RECEIVED'; text: string }
  | { type: 'RESET' };

export interface TestingContextValue {
  state: TestingState;
  createSession: (profile: SessionProfile) => Promise<void>;
  sendMessage: (message: string, displayText?: string) => Promise<void>;
  submitFeedback: (turnNumber: number, isAccurate: boolean, notes?: string) => Promise<void>;
  fetchScoring: () => Promise<void>;
  selectTurn: (turnNumber: number) => void;
  toggleInspector: () => void;
  reconnectSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  reset: () => void;
}

// --- Reducer ---

const initialState: TestingState = {
  sessionId: null,
  messages: [],
  scoring: null,
  turns: [],
  selectedTurn: null,
  streaming: false,
  error: null,
  errorCode: null,
  sessions: [],
  connectionStatus: 'checking',
  promptVersion: 'v1',
  inspectorOpen: false,
  // Console v2 — Observability state
  sessionStatus: null,
  sessionMode: null,
  sessionMetadata: null,
  perception: null,
  theme: null,
  output: null,
  categoryScores: null,
  // Console v2 — Binary scoring (scoring-v2-amendment)
  binaryScoringState: null,
  binaryRiskLevel: null,
  chipsAnswered: [],
  chipsRequest: null,
  dimensiTerisi: [],
  dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
  dimensiDetail: {},
  phase: null,
};

function testingReducer(state: TestingState, action: TestingAction): TestingState {
  switch (action.type) {
    case 'SESSION_CREATED':
      return {
        ...initialState,
        sessionId: action.sessionId,
        sessions: state.sessions,
        connectionStatus: state.connectionStatus,
        inspectorOpen: state.inspectorOpen,
        sessionStatus: null,
        sessionMode: null,
        sessionMetadata: null,
        perception: null,
        theme: null,
        output: null,
        categoryScores: null,
      };
    case 'STREAM_START':
      return { ...state, streaming: true, error: null, errorCode: null };
    case 'STREAM_CHUNK': {
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const updated = [...state.messages];
        updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + action.text };
        return { ...state, messages: updated };
      }
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: action.text }],
      };
    }
    case 'STREAM_COMPLETE': {
      const latestTurn =
        action.turns.length > 0
          ? action.turns[action.turns.length - 1]!.turnNumber
          : state.selectedTurn;
      // If messages are empty but turns exist (e.g. after hot-reload), reconstruct from turns
      let messages = state.messages;
      if (messages.length === 0 && action.turns.length > 0) {
        messages = [];
        for (const turn of action.turns) {
          messages.push({
            role: 'user',
            content: turn.log.userMessage,
            turnNumber: turn.turnNumber,
          });
          let reply = '';
          try {
            const parsed = JSON.parse(turn.log.rawResponse);
            reply = parsed.reply || turn.log.rawResponse;
          } catch {
            reply = turn.log.rawResponse || '[no response]';
          }
          if (reply) {
            messages.push({ role: 'assistant', content: reply, turnNumber: turn.turnNumber });
          }
        }
      }
      return {
        ...state,
        messages,
        streaming: false,
        scoring: action.scoring,
        turns: action.turns,
        selectedTurn: latestTurn,
      };
    }
    case 'STREAM_ERROR':
      return { ...state, streaming: false, error: action.error, errorCode: action.code || null };
    case 'MESSAGE_SENT':
      return { ...state, messages: [...state.messages, { role: 'user', content: action.content }] };
    case 'FEEDBACK_SAVED': {
      const updatedTurns = state.turns.map((t) =>
        t.turnNumber === action.turnNumber
          ? { ...t, feedback: { isAccurate: action.isAccurate, notes: action.notes } }
          : t,
      );
      return { ...state, turns: updatedTurns };
    }
    case 'SELECT_TURN':
      return { ...state, selectedTurn: action.turnNumber };
    case 'SESSIONS_LOADED':
      return { ...state, sessions: action.sessions };
    case 'CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };
    case 'TOGGLE_INSPECTOR':
      return { ...state, inspectorOpen: !state.inspectorOpen };
    case 'RECONNECT':
      return {
        ...state,
        sessionId: action.sessionId,
        messages: action.messages,
        scoring: action.scoring,
        turns: action.turns,
        selectedTurn:
          action.turns.length > 0 ? action.turns[action.turns.length - 1]!.turnNumber : null,
        error: null,
        errorCode: null,
      };
    case 'SESSION_CONTEXT_LOADED':
      return {
        ...state,
        sessionStatus: action.sessionStatus,
        sessionMode: action.sessionMode,
        sessionMetadata: action.sessionMetadata,
        perception: action.perception,
        theme: action.theme as 'playful' | 'hybrid' | null,
        output: action.output,
        categoryScores: action.categoryScores,
      };
    case 'BINARY_SCORING_UPDATE':
      return {
        ...state,
        binaryScoringState: action.state,
        binaryRiskLevel: action.riskLevel,
        chipsAnswered: action.chipsAnswered ?? state.chipsAnswered,
      };
    case 'CHIPS_REQUEST':
      return {
        ...state,
        chipsRequest: action.request,
      };
    case 'DIMENSION_UPDATE':
      return {
        ...state,
        dimensiTerisi: action.dimensiTerisi,
        dimensiBelum: action.dimensiBelum,
        dimensiDetail: action.dimensiDetail,
      };
    case 'PHASE_UPDATE':
      return {
        ...state,
        phase: action.phase,
      };
    case 'GREETING_RECEIVED':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: action.text }],
      };
    case 'RESET':
      return {
        ...initialState,
        sessions: state.sessions,
        connectionStatus: state.connectionStatus,
        inspectorOpen: state.inspectorOpen,
        sessionStatus: null,
        sessionMode: null,
        sessionMetadata: null,
        perception: null,
        theme: null,
        output: null,
        categoryScores: null,
      };
    default:
      return state;
  }
}

// --- Context ---

const TestingContext = createContext<TestingContextValue | null>(null);

export function useTestingContext(): TestingContextValue {
  const ctx = useContext(TestingContext);
  if (!ctx) throw new Error('useTestingContext must be used within TestingProvider');
  return ctx;
}

// --- Provider ---

export function TestingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(testingReducer, initialState);
  const healthInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      if (state.streaming) {
        dispatch({ type: 'CONNECTION_STATUS', status: 'streaming' });
        return;
      }
      try {
        const res = await fetch('/api/health');
        dispatch({ type: 'CONNECTION_STATUS', status: res.ok ? 'connected' : 'error' });
      } catch {
        dispatch({ type: 'CONNECTION_STATUS', status: 'error' });
      }
    };
    checkHealth();
    healthInterval.current = setInterval(checkHealth, 30000);
    return () => {
      if (healthInterval.current) clearInterval(healthInterval.current);
    };
  }, [state.streaming]);

  const createSession = useCallback(async (profile: SessionProfile) => {
    try {
      const res = await fetch('/api/test/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const json = await res.json();
      if (!res.ok || !json.data?.sessionId) {
        dispatch({
          type: 'STREAM_ERROR',
          error: json.error?.message || 'Failed to create session',
        });
        return;
      }
      dispatch({ type: 'SESSION_CREATED', sessionId: json.data.sessionId });

      // Display the opening messages from session creation (bot initiates first).
      // There can be more than one: with the image gate at the start, the photo
      // request follows the greeting.
      if (json.data.openingMessages?.length) {
        for (const text of json.data.openingMessages) {
          dispatch({ type: 'GREETING_RECEIVED', text });
        }
        dispatch({ type: 'PHASE_UPDATE', phase: 'GREETING' });
      }
    } catch (err) {
      dispatch({
        type: 'STREAM_ERROR',
        error: err instanceof Error ? err.message : 'Network error',
      });
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/test/sessions');
      const json = await res.json();
      if (res.ok && json.data) {
        dispatch({ type: 'SESSIONS_LOADED', sessions: json.data });
      }
    } catch (err) {
      console.error('[TestingConsole] refreshSessions failed:', err);
    }
  }, []);

  const fetchScoringInternal = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/test/session/${sessionId}/scoring`);
        const json = await res.json();
        if (res.ok && json.data) {
          const data = json.data as ScoringEndpointResponse;
          // Unwrap nested Prisma records into flat TurnDetail shape
          const turns: TurnDetail[] = data.turns.map((t: ScoringTurnData) => ({
            turnNumber: t.turnNumber,
            log: t.log,
            extraction: t.extraction?.extraction ?? null,
            scores: t.extraction?.scores ?? null,
            feedback: t.feedback,
          }));
          dispatch({ type: 'STREAM_COMPLETE', scoring: data.scoring, turns });
          // Dispatch enriched session context (v2)
          const sessionData = data.session;
          const educationLevel = sessionData.demographics?.educationLevel?.toLowerCase() as
            | EducationLevelInput
            | undefined;
          dispatch({
            type: 'SESSION_CONTEXT_LOADED',
            sessionStatus: (sessionData.status ?? null) as 'IN_PROGRESS' | 'COMPLETED' | null,
            sessionMode: (sessionData.mode ?? null) as 'ai' | 'questionnaire' | null,
            sessionMetadata: sessionData.metadata ?? null,
            perception: (sessionData.perception ?? null) as 'adequate' | 'underestimate' | null,
            theme: selectTheme(educationLevel),
            output: sessionData.output ?? null,
            categoryScores: sessionData.scores
              ? Object.fromEntries(
                  Object.entries(sessionData.scores).map(([cat, s]) => [
                    cat,
                    typeof s === 'number' ? s : ((s as { capped?: number })?.capped ?? 0),
                  ]),
                )
              : null,
          });
          // Refresh session list (session now has messages → appears in history)
          refreshSessions();
        }
      } catch (err) {
        console.error('[TestingConsole] fetchScoring failed:', err);
      }
    },
    [refreshSessions],
  );

  const sendMessage = useCallback(
    async (message: string, displayText?: string) => {
      if (!state.sessionId) return;
      dispatch({ type: 'MESSAGE_SENT', content: displayText ?? message });
      dispatch({ type: 'CHIPS_REQUEST', request: null });
      dispatch({ type: 'STREAM_START' });
      dispatch({ type: 'CONNECTION_STATUS', status: 'streaming' });

      try {
        const res = await fetch('/api/screening/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: state.sessionId, message, isVoice: false }),
        });

        if (!res.ok || !res.body) {
          dispatch({ type: 'STREAM_ERROR', error: 'Failed to send message' });
          dispatch({ type: 'CONNECTION_STATUS', status: 'connected' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            if (!event.trim()) continue;
            const lines = event.split('\n');
            let eventType = '';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) eventType = line.slice(7);
              if (line.startsWith('data: ')) data = line.slice(6);
            }

            if (eventType === 'token' && data) {
              const parsed = JSON.parse(data);
              const text = typeof parsed === 'string' ? parsed : parsed.content;
              dispatch({ type: 'STREAM_CHUNK', text });
            } else if (eventType === 'chips_request' && data) {
              const parsed = JSON.parse(data);
              dispatch({ type: 'CHIPS_REQUEST', request: parsed });
            } else if (eventType === 'scoring' && data) {
              const parsed = JSON.parse(data);
              dispatch({
                type: 'BINARY_SCORING_UPDATE',
                state: parsed.state,
                riskLevel: parsed.riskLevel,
                chipsAnswered: parsed.chipsAnswered,
              });
            } else if (eventType === 'extraction' && data) {
              const parsed = JSON.parse(data);
              dispatch({
                type: 'DIMENSION_UPDATE',
                dimensiTerisi: parsed.dimensiTerisi ?? [],
                dimensiBelum: parsed.dimensiBelum ?? [],
                dimensiDetail: parsed.dimensiDetail ?? {},
              });
            } else if (eventType === 'phase' && data) {
              const phase = JSON.parse(data);
              dispatch({ type: 'PHASE_UPDATE', phase });
            } else if (eventType === 'error' && data) {
              const parsed = JSON.parse(data);
              dispatch({
                type: 'STREAM_ERROR',
                error: parsed.message || parsed.code,
                code: parsed.code,
              });
            } else if (eventType === 'done') {
              // Don't clear chips here — chips_request persists until user answers
              await fetchScoringInternal(state.sessionId);
            }
          }
        }
        dispatch({ type: 'CONNECTION_STATUS', status: 'connected' });
      } catch (err) {
        dispatch({
          type: 'STREAM_ERROR',
          error: err instanceof Error ? err.message : 'Stream error',
        });
        dispatch({ type: 'CONNECTION_STATUS', status: 'error' });
      }
    },
    [state.sessionId, fetchScoringInternal],
  );

  const fetchScoring = useCallback(async () => {
    if (!state.sessionId) return;
    await fetchScoringInternal(state.sessionId);
  }, [state.sessionId, fetchScoringInternal]);

  const selectTurn = useCallback((turnNumber: number) => {
    dispatch({ type: 'SELECT_TURN', turnNumber });
  }, []);

  const toggleInspector = useCallback(() => {
    dispatch({ type: 'TOGGLE_INSPECTOR' });
  }, []);

  const submitFeedback = useCallback(
    async (turnNumber: number, isAccurate: boolean, notes?: string) => {
      if (!state.sessionId) return;
      try {
        const res = await fetch(`/api/test/session/${state.sessionId}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnNumber, evaluatorType: 'DEVELOPER', isAccurate, notes }),
        });
        if (res.ok) {
          dispatch({ type: 'FEEDBACK_SAVED', turnNumber, isAccurate, notes: notes ?? null });
        }
      } catch (err) {
        console.error('[TestingConsole] submitFeedback failed:', err);
      }
    },
    [state.sessionId],
  );

  const reconnectSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/test/session/${sessionId}/scoring`);
      const json = await res.json();
      if (!res.ok || !json.data) {
        dispatch({ type: 'STREAM_ERROR', error: 'Session not found or not accessible' });
        return;
      }
      const data = json.data as ScoringEndpointResponse;
      // Unwrap nested Prisma records
      const turns: TurnDetail[] = data.turns.map((t: ScoringTurnData) => ({
        turnNumber: t.turnNumber,
        log: t.log,
        extraction: t.extraction?.extraction ?? null,
        scores: t.extraction?.scores ?? null,
        feedback: t.feedback,
      }));

      const messages: Message[] = [];
      // Load actual chat messages from session endpoint (V2 stores replies in chatMessage table)
      try {
        const msgRes = await fetch(`/api/screening/${sessionId}/session`);
        const msgJson = await msgRes.json();
        if (msgRes.ok && msgJson.data?.messages && msgJson.data.messages.length > 0) {
          let turnCounter = 0;
          for (const m of msgJson.data.messages as Array<{ role: string; content: string }>) {
            if (m.role === 'user') turnCounter++;
            messages.push({
              role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
              turnNumber: turnCounter,
            });
          }
        } else {
          throw new Error('no messages from session endpoint');
        }
      } catch {
        // Fallback: reconstruct from TurnLogs (V1 sessions or session endpoint unavailable)
        for (const turn of turns) {
          messages.push({
            role: 'user',
            content: turn.log.userMessage,
            turnNumber: turn.turnNumber,
          });
          let reply = '';
          try {
            const parsed = JSON.parse(turn.log.rawResponse);
            reply = parsed.reply || parsed.content || '';
          } catch {
            reply = '';
          }
          if (reply) {
            messages.push({ role: 'assistant', content: reply, turnNumber: turn.turnNumber });
          }
        }
      }
      dispatch({ type: 'RECONNECT', sessionId, messages, scoring: data.scoring, turns });
      // Dispatch enriched session context (v2)
      const sessionData = data.session;
      const educationLevel = sessionData.demographics?.educationLevel?.toLowerCase() as
        | EducationLevelInput
        | undefined;
      dispatch({
        type: 'SESSION_CONTEXT_LOADED',
        sessionStatus: (sessionData.status ?? null) as 'IN_PROGRESS' | 'COMPLETED' | null,
        sessionMode: (sessionData.mode ?? null) as 'ai' | 'questionnaire' | null,
        sessionMetadata: sessionData.metadata ?? null,
        perception: (sessionData.perception ?? null) as 'adequate' | 'underestimate' | null,
        theme: selectTheme(educationLevel),
        output: sessionData.output ?? null,
        categoryScores: sessionData.scores
          ? Object.fromEntries(
              Object.entries(sessionData.scores).map(([cat, s]) => [
                cat,
                typeof s === 'number' ? s : ((s as { capped?: number })?.capped ?? 0),
              ]),
            )
          : null,
      });

      // Restore binary scoring state and dimension coverage (V2)
      if (sessionData.scoringState) {
        const scoringState = sessionData.scoringState as Record<string, boolean>;
        const gejalaCount = [
          scoringState.gatalMalam,
          scoringState.kontakSerupa,
          scoringState.lokasiKhas,
        ].filter(Boolean).length;
        const faktorCount = [scoringState.asrama, scoringState.tukarAlat].filter(Boolean).length;
        let riskLevel: BinaryRiskLevel;
        if (gejalaCount >= 2) riskLevel = 'HIGH';
        else if (gejalaCount === 1 && faktorCount > 0) riskLevel = 'MODERATE';
        else riskLevel = 'LOW';

        dispatch({
          type: 'BINARY_SCORING_UPDATE',
          state: scoringState as unknown as BinaryScoringState,
          riskLevel,
          chipsAnswered: (sessionData.chipsAnswered ?? []) as ChipsType[],
        });
      }

      // Restore dimension coverage
      if (sessionData.dimensiTerisi) {
        const dimData = sessionData.dimensiTerisi as Record<
          string,
          { keywords: string[]; negasi: string[] }
        >;
        const terisi = Object.keys(dimData);
        const belum = (sessionData.dimensiBelum ?? []) as string[];
        dispatch({
          type: 'DIMENSION_UPDATE',
          dimensiTerisi: terisi,
          dimensiBelum: belum,
          dimensiDetail: dimData,
        });
      }
    } catch (err) {
      dispatch({
        type: 'STREAM_ERROR',
        error: err instanceof Error ? err.message : 'Failed to reconnect',
      });
    }
  }, []);

  const loadSessions = useCallback(async () => {
    await refreshSessions();
  }, [refreshSessions]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    refreshSessions();
  }, [refreshSessions]);

  return (
    <TestingContext.Provider
      value={{
        state,
        createSession,
        sendMessage,
        submitFeedback,
        fetchScoring,
        selectTurn,
        toggleInspector,
        reconnectSession,
        loadSessions,
        reset,
      }}
    >
      {children}
    </TestingContext.Provider>
  );
}
