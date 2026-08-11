'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useScreening } from '../../_components/ScreeningProvider';
import { useSSE } from '@/hooks/useSSE';
import { saveActiveSession, clearActiveSession } from '@/hooks/useActiveSession';
import type { SSEParsedEvent } from '@/hooks/useSSE';
import { useHistory } from '@/hooks/useHistory';
import type { ChatMessage, DemographicsInput } from '@/types/screening-ui';
import type { ResultPayload } from '@/types/screening-ui-api';
import type {
  SessionPhase,
  QuickReply,
  StartResponse as StartV2Response,
} from '@/features/screening-chat-v2';
import type { ChipsRequest, ChipsSubState } from '@/features/screening-chat-v2/domain/types';

// ─── V2 SSE event data types ───
// NOTE: token, phase, and quick_replies arrive as raw values (string, string, QuickReply[])
// after JSON.parse in useSSE. Only structured events need explicit interfaces.

interface ResultEventData {
  revision: number;
  riskLevel: string;
  totalScore: number;
}

interface ExtractionEventData {
  dimensiTerisi: string[];
  dimensiBelum: string[];
}

interface DoneEventData {
  turnCount: number;
}

interface ErrorEventData {
  code: string;
  message: string;
}

// ─── Mapping helpers ───

/** Map production riskLevel to frontend RiskKey */
function mapRiskLevel(riskLevel: string): ResultPayload['level'] {
  const map: Record<string, ResultPayload['level']> = {
    HIGH: 'tinggi',
    MODERATE: 'sedang',
    LOW: 'rendah',
  };
  return map[riskLevel] ?? 'rendah';
}

/** Map production demographics to start request format */
function mapDemographics(demographics: DemographicsInput): {
  name?: string;
  age: number;
  gender: 'male' | 'female';
  educationLevel: string;
} {
  return {
    name: demographics.nama || undefined,
    age: demographics.usia ?? 18,
    gender: demographics.jenisKelamin === 'P' ? 'female' : 'male',
    educationLevel: mapPendidikan(demographics.pendidikan),
  };
}

/** Map Indonesian education level string to production API enum value */
function mapPendidikan(pendidikan?: string): 'elementary' | 'junior_high' | 'senior_high' {
  if (!pendidikan) return 'senior_high';
  const lower = pendidikan.toLowerCase();
  if (lower.includes('sd') || lower.includes('elementary')) return 'elementary';
  if (lower.includes('smp') || lower.includes('junior')) return 'junior_high';
  return 'senior_high';
}

/** Map production mode to frontend ScreeningMode */
function mapMode(mode: 'ai' | 'questionnaire'): 'ai' | 'q' {
  return mode === 'questionnaire' ? 'q' : 'ai';
}

/** Map v2 result event to frontend ResultPayload */
function mapResultV2(data: ResultEventData, sessionId: string, shareToken: string): ResultPayload {
  return {
    sessionId,
    shareToken,
    score: data.totalScore,
    level: mapRiskLevel(data.riskLevel),
    needsReview: false,
    kesimpulan: '',
    persona: '',
    aksi: [],
    saran: '',
  };
}

// ─── API envelope types ───

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { timestamp: string; requestId: string };
}

interface StartApiResponse {
  sessionId: string;
  shareToken: string;
  theme: string;
  locale: string;
  mode: 'ai' | 'questionnaire';
  openingMessage: string;
  pills?: Array<{ id: string; label: string }>;
  pillSelection?: 'single' | 'multi';
}

interface ResumeApiResponse {
  sessionId: string;
  phase: SessionPhase;
  turnCount: number;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  messages?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
}

// ─── Hook ───

/** Orchestrates the v2 chat session: bootstrap, SSE streaming, phase tracking, quick replies. */
export function useChat(): {
  ready: boolean;
  msgs: ChatMessage[];
  typing: boolean;
  finished: boolean;
  result: ResultPayload | null;
  connectionError: boolean;
  phase: SessionPhase | null;
  quickReplies: QuickReply[];
  resultRevision: number;
  chipsRequest: ChipsRequest | null;
  chipsSubState: ChipsSubState;
  sendReply: (text: string, optionIndex?: number) => void;
  sendQuickReply: (token: string, label?: string) => void;
  submitChipsAnswer: (selections: string[], freeText?: string, displayText?: string) => void;
  retry: () => void;
} {
  const locale = useLocale();
  const t = useTranslations('chat');
  const { sessionId, shareToken, incognito, demographics, setSession, setPhase } = useScreening();
  const { addEntry } = useHistory();

  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [ready, setReady] = useState(false);
  const [phase, setLocalPhase] = useState<SessionPhase | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [resultRevision, setResultRevision] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chipsRequest, setChipsRequest] = useState<ChipsRequest | null>(null);
  const [chipsSubState, setChipsSubState] = useState<ChipsSubState>('FREE_TEXT');

  const initRef = useRef(false);
  const historyRecorded = useRef(false);
  const lastAttempt = useRef<{ text: string } | null>(null);
  const tokenBufferRef = useRef('');
  const typingEmitted = useRef(false);
  const phaseRef = useRef<SessionPhase | null>(null);
  const chipsReceivedThisTurn = useRef(false);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local phase to provider context
  const updatePhase = useCallback(
    (newPhase: SessionPhase) => {
      setLocalPhase(newPhase);
      setPhase(newPhase);
      phaseRef.current = newPhase;
    },
    [setPhase],
  );

  // ─── SSE event handler: parse v2 typed events ───
  // NOTE: useSSE JSON-parses the `data:` line, so raw.data matches SSEEvent['data'] directly:
  //   token → string, phase → string, quick_replies → QuickReply[], etc.
  const onEvent = useCallback(
    (raw: SSEParsedEvent) => {
      switch (raw.event) {
        case 'token': {
          // raw.data is a string directly (not { content: string })
          const tokenText = raw.data as string;
          if (!typingEmitted.current) {
            typingEmitted.current = true;
            setTyping(true);
          }
          tokenBufferRef.current += tokenText;
          break;
        }

        case 'phase': {
          // raw.data is a SessionPhase string (e.g. "COLLECTING")
          const phaseValue = raw.data as SessionPhase;
          updatePhase(phaseValue);
          break;
        }

        case 'quick_replies': {
          // raw.data is QuickReply[] directly
          const replies = raw.data as QuickReply[];
          setQuickReplies(replies);
          break;
        }

        case 'chips_request': {
          // raw.data is ChipsRequest — activate chips selector
          const request = raw.data as ChipsRequest;
          setChipsRequest(request);
          setChipsSubState('CHIPS_ACTIVE');
          chipsReceivedThisTurn.current = true;
          break;
        }

        case 'result': {
          // raw.data is { revision, riskLevel, totalScore }
          const data = raw.data as ResultEventData;
          setResultRevision(data.revision);
          if (sessionId && shareToken) {
            const mapped = mapResultV2(data, sessionId, shareToken);
            setResult(mapped);
          }
          break;
        }

        case 'extraction': {
          // raw.data is { dimensiTerisi: string[], dimensiBelum: string[] }
          void (raw.data as ExtractionEventData);
          break;
        }

        case 'done': {
          // raw.data is { turnCount: number }
          void (raw.data as DoneEventData);
          setTyping(false);
          setIsProcessing(false);
          typingEmitted.current = false;
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }

          // Assemble accumulated tokens into a bot message
          if (tokenBufferRef.current) {
            const botMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'bot',
              text: tokenBufferRef.current,
              createdAt: new Date().toISOString(),
            };
            setMsgs((prev) => [...prev, botMessage]);
            tokenBufferRef.current = '';
          }

          // Reset chips state when done arrives (unless a new chips_request was received this turn)
          if (!chipsReceivedThisTurn.current) {
            setChipsRequest(null);
            setChipsSubState('FREE_TEXT');
          }
          chipsReceivedThisTurn.current = false;

          // Check if screening is complete (terminal phase)
          if (phaseRef.current === 'CLOSED' || phaseRef.current === 'SCREENING_COMPLETE') {
            setFinished(true);
            clearActiveSession();
          }
          break;
        }

        case 'error': {
          // raw.data is { code: string, message: string }
          const data = raw.data as ErrorEventData;
          setTyping(false);
          setIsProcessing(false);
          typingEmitted.current = false;
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }

          // Discard partial token buffer (backend already sent fallback text via token —
          // we replace it with a single clean error bubble instead of showing both)
          tokenBufferRef.current = '';

          // Add single error message as a bot bubble
          const errorText =
            data.code === 'LLM_UNAVAILABLE' ? t('botErrorLlm') : t('botErrorGeneric');
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'bot',
            text: errorText,
            createdAt: new Date().toISOString(),
          };
          setMsgs((prev) => [...prev, errorMessage]);

          setConnectionError(true);
          break;
        }

        default: {
          // V1 backward-compat: handle old-style 'done' with isComplete
          if (raw.event === 'message') break;
          break;
        }
      }
    },
    [sessionId, shareToken, updatePhase, t],
  );

  const onError = useCallback(() => {
    setTyping(false);
    setIsProcessing(false);
    typingEmitted.current = false;

    // Flush partial token buffer
    if (tokenBufferRef.current) {
      const partialMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bot',
        text: tokenBufferRef.current,
        createdAt: new Date().toISOString(),
      };
      setMsgs((prev) => [...prev, partialMessage]);
      tokenBufferRef.current = '';
    }

    // Add error bubble
    const errorMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'bot',
      text: t('botErrorDisconnected'),
      createdAt: new Date().toISOString(),
    };
    setMsgs((prev) => [...prev, errorMessage]);

    setConnectionError(true);
  }, [t]);

  const { send } = useSSE<SSEParsedEvent>({ onEvent, onError });

  // ─── Bootstrap: resume session from URL or start new ───
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        // Attempt session resume if we already have a sessionId
        if (sessionId) {
          const res = await fetch(`/api/screening/${sessionId}/session`);
          if (res.ok) {
            const envelope = (await res.json()) as ApiEnvelope<ResumeApiResponse>;
            if (envelope.data) {
              const sessionData = envelope.data;
              updatePhase(sessionData.phase);

              // Hydrate messages if available from resume
              if (sessionData.messages && sessionData.messages.length > 0) {
                const chatMessages: ChatMessage[] = sessionData.messages.map((m, idx) => ({
                  id: `restored-${idx}`,
                  role: m.role === 'user' ? 'user' : 'bot',
                  text: m.content,
                  createdAt: m.timestamp,
                }));
                setMsgs(chatMessages);
              } else {
                // No messages returned — show greeting so chat isn't empty
                const greeting = t('botGreeting');
                setMsgs([
                  {
                    id: crypto.randomUUID(),
                    role: 'bot',
                    text: greeting,
                    createdAt: new Date().toISOString(),
                  },
                ]);
              }

              // If session is in terminal phase, mark finished
              if (sessionData.phase === 'CLOSED') {
                setFinished(true);
                clearActiveSession();
              }
              setReady(true);
              return;
            }
          }
        }

        // Start a new session
        // Send locale (required for v2) + demographics (required for v1, ignored by v2)
        const startBody =
          demographics && Object.keys(demographics).length > 0
            ? { demographics: mapDemographics(demographics), locale }
            : { locale };
        const res = await fetch('/api/screening/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(startBody),
        });
        if (!res.ok) throw new Error('start failed');
        const envelope = (await res.json()) as ApiEnvelope<StartApiResponse | StartV2Response>;
        if (!envelope.data) throw new Error('start returned no data');

        const data = envelope.data;

        // Detect v2 response (has phase field, no openingMessage)
        if ('phase' in data && !('openingMessage' in data)) {
          // V2 flow: createSession returns { sessionId, phase }
          const v2Data = data as StartV2Response;
          setSession(v2Data.sessionId, v2Data.sessionId, 'ai'); // use sessionId as shareToken placeholder
          saveActiveSession(v2Data.sessionId);
          updatePhase(v2Data.phase);

          // Create a local greeting message (v2 gets bot response via first chat turn)
          const greeting = t('botGreeting');

          const openingMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'bot',
            text: greeting,
            createdAt: new Date().toISOString(),
          };
          setMsgs([openingMsg]);
          setReady(true);
        } else {
          // V1 flow (original code)
          const v1Data = data as StartApiResponse;
          setSession(v1Data.sessionId, v1Data.shareToken, mapMode(v1Data.mode));
          updatePhase('GREETING');

          const openingMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'bot',
            text: v1Data.openingMessage,
            createdAt: new Date().toISOString(),
          };
          setMsgs([openingMsg]);
          setReady(true);
        }
      } catch {
        setConnectionError(true);
      }
    })();
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record to history once finished (unless incognito)
  useEffect(() => {
    if (finished && result && !incognito && !historyRecorded.current) {
      historyRecorded.current = true;
      addEntry({
        id: sessionId!,
        shareToken: result.shareToken,
        createdAt: new Date().toISOString(),
        score: result.score,
        level: result.level,
        mode: 'ai',
        finished: true,
        nama: demographics?.nama,
        usia: demographics?.usia ? Number(demographics.usia) : undefined,
        jenisKelamin: demographics?.jenisKelamin,
      });
    }
  }, [finished, result, incognito, addEntry, sessionId, demographics]);

  // ─── Send free-text message (disabled during processing) ───
  const sendReply = useCallback(
    (text: string, _optionIndex?: number) => {
      if (!sessionId || finished || isProcessing) return;

      lastAttempt.current = { text };
      setIsProcessing(true);
      setTyping(true);
      setConnectionError(false);
      setQuickReplies([]);
      setChipsRequest(null);
      setChipsSubState('FREE_TEXT');
      tokenBufferRef.current = '';
      typingEmitted.current = false;

      // Safety timeout: if no response in 30s, reset processing state and show error
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
        setTyping(false);
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'bot',
          text: '⚠️ Tidak ada respons dari server. Coba kirim ulang ya.',
          createdAt: new Date().toISOString(),
        };
        setMsgs((prev) => [...prev, errorMsg]);
      }, 30000);

      setMsgs((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text, createdAt: new Date().toISOString() },
      ]);

      send('/api/screening/chat', { sessionId, message: text, isVoice: false });
    },
    [sessionId, finished, isProcessing, send],
  );

  // ─── Send quick-reply token (bypasses extraction) ───
  const sendQuickReply = useCallback(
    (token: string, label?: string) => {
      if (!sessionId || finished || isProcessing) return;

      const displayLabel = label || token;
      lastAttempt.current = { text: displayLabel };
      setIsProcessing(true);
      setTyping(true);
      setConnectionError(false);
      setQuickReplies([]);
      tokenBufferRef.current = '';
      typingEmitted.current = false;

      setMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          text: displayLabel,
          createdAt: new Date().toISOString(),
        },
      ]);

      send('/api/screening/chat', {
        sessionId,
        message: displayLabel,
        quickReplyToken: token,
        isVoice: false,
      });
    },
    [sessionId, finished, isProcessing, send],
  );

  // ─── Submit chips answer (formats selections and sends via standard message endpoint) ───
  const submitChipsAnswer = useCallback(
    (selections: string[], freeText?: string, displayText?: string) => {
      if (!sessionId || finished || isProcessing) return;

      // Format the message from selections (tokens for backend)
      const message = freeText ? [...selections, freeText].join(', ') : selections.join(', ');

      // Display text: use provided label text, or fall back to token message
      const bubbleText = displayText || message;

      // Clear the current chips request (server will send next one if needed)
      setChipsRequest(null);
      setIsProcessing(true);
      setTyping(true);
      setConnectionError(false);
      tokenBufferRef.current = '';
      typingEmitted.current = false;

      // Add user message to chat (show labels in bubble)
      setMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          text: bubbleText,
          createdAt: new Date().toISOString(),
        },
      ]);

      // Send tokens to backend for parsing
      send('/api/screening/chat', { sessionId, message, isVoice: false });
    },
    [sessionId, finished, isProcessing, send],
  );

  // ─── Retry last failed message ───
  const retry = useCallback(() => {
    if (!lastAttempt.current || !sessionId || isProcessing) return;
    setIsProcessing(true);
    setTyping(true);
    setConnectionError(false);
    tokenBufferRef.current = '';
    typingEmitted.current = false;
    send('/api/screening/chat', { sessionId, message: lastAttempt.current.text, isVoice: false });
  }, [sessionId, isProcessing, send]);

  return {
    ready,
    msgs,
    typing,
    finished,
    result,
    connectionError,
    phase,
    quickReplies,
    resultRevision,
    chipsRequest,
    chipsSubState,
    sendReply,
    sendQuickReply,
    submitChipsAnswer,
    retry,
  };
}
