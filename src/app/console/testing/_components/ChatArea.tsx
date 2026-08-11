'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTestingContext, type TurnDetail, type ChipsRequestData } from './TestingContext';

// --- Polling config ---
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;

// --- AI Result type from API ---
interface AiResultFields {
  aiConclusion: string | null;
  aiPerceptionResponse: string | null;
  aiRecommendation: string | null;
  aiSuggestion: string | null;
}

// --- Fallback text for testing console (hardcoded, dev tool) ---
const FALLBACK_TEXT: Record<string, string> = {
  'conclusion.HIGH':
    'Berdasarkan skrining, risiko skabies kamu tergolong tinggi. Ada beberapa gejala utama yang perlu segera diperiksa oleh tenaga kesehatan.',
  'conclusion.MODERATE':
    'Ada beberapa tanda yang perlu diperhatikan. Belum tentu skabies, tapi sebaiknya tetap waspada dan jaga kebersihan.',
  'conclusion.LOW':
    'Dari skrining ini, risiko skabies kamu tergolong rendah. Tidak perlu khawatir berlebihan, tapi tetap jaga kebersihan ya.',
  'perception.HIGH':
    'Kami paham ini mungkin bikin khawatir. Tapi tenang, dengan penanganan yang tepat, skabies bisa disembuhkan.',
  'perception.MODERATE':
    'Tidak perlu panik. Yang penting kamu sudah aware dan bisa mulai menjaga kebersihan lebih baik.',
  'perception.LOW':
    'Bagus! Kamu sudah peduli sama kesehatan kulit. Tetap pertahankan kebiasaan bersih yang sudah kamu lakukan.',
  'recommendation.HIGH':
    'Segera temui kader kesehatan atau dokter\nJangan tukar handuk, sisir, atau alat pribadi lainnya\nCuci sprei dan sarung bantal dengan air panas\nJemur kasur dan bantal di bawah sinar matahari\nBeritahu teman sekamar agar ikut diperiksa',
  'recommendation.MODERATE':
    'Jaga kebersihan diri dan lingkungan tidur\nJangan pinjam-meminjam handuk atau pakaian\nGanti sprei minimal seminggu sekali\nJika gatal tidak membaik dalam 3 hari, segera periksa ke kader atau dokter',
  'recommendation.LOW':
    'Tetap jaga kebersihan diri setiap hari\nJangan pinjam-meminjam alat pribadi seperti handuk dan sisir\nGanti pakaian dan sprei secara rutin',
  'suggestion.HIGH':
    'Jangan tunda untuk periksa ya. Semakin cepat ditangani, semakin cepat sembuh. Kalau perlu, ajak teman sekamar untuk diperiksa juga.',
  'suggestion.MODERATE':
    'Perhatikan apakah gatal bertambah parah atau muncul di tempat baru. Kalau iya, langsung periksa ke kader kesehatan.',
  'suggestion.LOW':
    'Tetap jaga kebersihan dan perhatikan kalau ada perubahan di kulit. Kalau sewaktu-waktu muncul gatal yang tidak biasa, jangan ragu untuk skrining lagi.',
};

function getFallbackText(section: string, riskLevel: string): string {
  return FALLBACK_TEXT[`${section}.${riskLevel}`] ?? '';
}

export function ChatArea() {
  const { state, sendMessage, selectTurn } = useTestingContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [chipsSelections, setChipsSelections] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const prevChipsIdRef = useRef<string | undefined>(undefined);

  // --- AI Result polling state ---
  const [aiResult, setAiResult] = useState<AiResultFields | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTimedOut, setAiTimedOut] = useState(false);
  const pollCountRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Polling logic ---
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const fetchAiResult = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      const res = await fetch(`/api/screening/result/${state.sessionId}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data as AiResultFields | undefined;
      if (data?.aiConclusion !== null && data?.aiConclusion !== undefined) {
        // AI ready — stop polling and render cards
        setAiResult(data);
        setAiLoading(false);
        stopPolling();
        return;
      }
    } catch {
      // Silently ignore fetch errors during polling
    }

    // Increment poll count
    pollCountRef.current += 1;
    if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
      // Timeout — stop polling, show fallback
      setAiLoading(false);
      setAiTimedOut(true);
      stopPolling();
    }
  }, [state.sessionId, stopPolling]);

  // Open result modal — only poll if we don't have cached AI result
  const openResultModal = useCallback(() => {
    setShowResult(true);
    if (aiResult) return; // Already have result — no need to re-fetch
    setAiLoading(true);
    setAiTimedOut(false);
    pollCountRef.current = 0;
  }, [aiResult]);

  // Start polling when result modal opens
  useEffect(() => {
    if (!showResult || !state.sessionId) return;

    // First fetch immediately
    const doInitialFetch = async () => {
      try {
        const res = await fetch(`/api/screening/result/${state.sessionId}`);
        if (!res.ok) {
          setAiLoading(false);
          setAiTimedOut(true);
          return;
        }
        const json = await res.json();
        const data = json.data as AiResultFields | undefined;
        if (data?.aiConclusion !== null && data?.aiConclusion !== undefined) {
          // AI already ready — skip polling
          setAiResult(data);
          setAiLoading(false);
          return;
        }
      } catch {
        // continue to polling
      }

      pollCountRef.current = 1;
      // Start interval polling
      pollIntervalRef.current = setInterval(fetchAiResult, POLL_INTERVAL_MS);
    };

    doInitialFetch();

    return () => {
      stopPolling();
    };
  }, [showResult, state.sessionId, fetchAiResult, stopPolling]);

  // Reset chip selections when a new chips request arrives
  if (state.chipsRequest?.id !== prevChipsIdRef.current) {
    prevChipsIdRef.current = state.chipsRequest?.id;
    if (chipsSelections.length > 0) {
      setChipsSelections([]);
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.streaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || state.streaming) return;
    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const getTurnForMessage = (index: number): TurnDetail | undefined => {
    const turnNumber = Math.floor(index / 2) + 1;
    return state.turns.find((t) => t.turnNumber === turnNumber);
  };

  const getTurnDelta = (turnNumber: number): number | null => {
    const turnIdx = state.turns.findIndex((t) => t.turnNumber === turnNumber);
    if (turnIdx < 0) return null;
    const currentTurn = state.turns[turnIdx]!;
    if (!currentTurn.scores) return null;
    const currentTotal = Object.values(currentTurn.scores).reduce(
      (sum, s) => sum + ((s as { capped?: number }).capped ?? (s as { score?: number }).score ?? 0),
      0,
    );
    if (turnIdx === 0) return currentTotal;
    for (let i = turnIdx - 1; i >= 0; i--) {
      const prev = state.turns[i]!;
      if (prev.scores) {
        const prevTotal = Object.values(prev.scores).reduce(
          (sum, s) =>
            sum + ((s as { capped?: number }).capped ?? (s as { score?: number }).score ?? 0),
          0,
        );
        return currentTotal - prevTotal;
      }
    }
    return currentTotal;
  };

  if (!state.sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white text-[11px] text-[#b9b2a3]">
        Create or select a session to start
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-4">
          {state.messages.length === 0 && (
            <p className="py-16 text-center text-[11px] text-[#b9b2a3]">
              ketik pesan untuk mulai skrining...
            </p>
          )}

          {state.messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            // Turn badge shows after user message (turn = extraction of that user input)
            const isUserWithTurn = msg.role === 'user' && i > 0;
            const turn = isUserWithTurn ? getTurnForMessage(i) : undefined;

            return (
              <div key={i}>
                <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 text-[12px] leading-relaxed ${
                      isUser
                        ? 'bg-[#e9f0f8] text-[#2d4a6f] border border-[#cfdcec] rounded-tr-sm'
                        : 'bg-[#f3f1ea] text-[#4a4035] border border-[#e2ddd0] rounded-tl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {state.streaming &&
                      i === state.messages.length - 1 &&
                      msg.role === 'assistant' && (
                        <span className="ml-0.5 inline-block animate-pulse text-[#d9a319]">▎</span>
                      )}
                  </div>
                </div>

                {/* Inline turn summary — on user side */}
                {turn && (
                  <div className="flex justify-end">
                    <InlineTurnSummary
                      turn={turn}
                      delta={getTurnDelta(turn.turnNumber)}
                      isSelected={state.selectedTurn === turn.turnNumber}
                      onSelect={() => selectTurn(turn.turnNumber)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Streaming */}
          {state.streaming && (
            <div className="flex items-center gap-2 pl-1 text-[10px] text-[#d9a319]">
              <span className="flex gap-0.5">
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d9a319]"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d9a319]"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d9a319]"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
              streaming...
            </div>
          )}

          {/* Lihat Hasil button — after SCREENING_COMPLETE */}
          {state.phase === 'SCREENING_COMPLETE' && !state.streaming && (
            <div className="flex justify-center pt-4">
              <button
                onClick={openResultModal}
                className="rounded-full bg-emerald-600 px-6 py-2.5 text-[12px] font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-95"
              >
                Lihat Hasil Skrining
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="border-t border-red-200 bg-red-50 px-6 py-2.5 text-[11px] font-medium text-red-600">
          ⚠ {state.error}
        </div>
      )}

      {/* Chips selector (when chips_request active) */}
      {state.chipsRequest && (
        <ChipsPanel
          request={state.chipsRequest}
          selections={chipsSelections}
          onToggle={(token, group) => {
            setChipsSelections((prev) => {
              if (state.chipsRequest?.groups && group) {
                // Grouped: single-select per group
                const groupTokens =
                  state.chipsRequest.groups
                    .find((g) => g.id === group)
                    ?.options.map((o) => o.token) ?? [];
                const withoutGroup = prev.filter((s) => !groupTokens.includes(s));
                return prev.includes(token) ? withoutGroup : [...withoutGroup, token];
              }
              if (state.chipsRequest?.type === 'single') {
                return prev.includes(token) ? [] : [token];
              }
              // Multi-select toggle
              return prev.includes(token) ? prev.filter((s) => s !== token) : [...prev, token];
            });
          }}
          onSubmit={() => {
            // Display label in chat bubble, send token to backend
            const allOptions = [
              ...(state.chipsRequest?.options ?? []),
              ...(state.chipsRequest?.groups?.flatMap((g) => g.options) ?? []),
            ];
            const labels = chipsSelections.map((token) => {
              const opt = allOptions.find((o) => o.token === token);
              return opt?.label ?? token;
            });
            const displayMessage = labels.join(', ');
            const tokenMessage = chipsSelections.join(', ');
            setChipsSelections([]);
            // Send token to backend (for parsing), but show label in UI
            sendMessage(tokenMessage, displayMessage);
          }}
          disabled={state.streaming}
        />
      )}

      {/* Input */}
      <div className="border-t border-[#e2ddd0] bg-[#f7f4ee] px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ketik pesan..."
            disabled={state.streaming}
            className="flex-1 rounded-full border border-[#e2ddd0] bg-white px-5 py-2.5 text-[12px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-2 focus:ring-[#d9a319]/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={state.streaming || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4a4035] text-[#f4f1ea] shadow-md transition hover:bg-[#3a3228] disabled:opacity-30"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </form>
      </div>

      {/* Result Modal */}
      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowResult(false)}
              className="absolute right-4 top-4 text-[#b9b2a3] hover:text-[#4a4035]"
            >
              ✕
            </button>
            <h2 className="mb-4 text-center text-lg font-bold text-[#4a4035]">Hasil Skrining</h2>

            {/* Risk Level Chip — focal point */}
            <div className="mb-4 flex justify-center">
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                  state.binaryRiskLevel === 'HIGH'
                    ? 'bg-red-100 text-red-700'
                    : state.binaryRiskLevel === 'MODERATE'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                Risiko: {state.binaryRiskLevel ?? 'N/A'}
              </span>
            </div>

            {/* AI Loading State */}
            {aiLoading && (
              <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-[#f7f4ee] p-4">
                <svg
                  className="h-5 w-5 animate-spin text-[#d9a319]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-[11px] font-medium text-[#6b5e4f]">
                  Menganalisis hasil...
                </span>
              </div>
            )}

            {/* 4 AI Cards — shown when AI is ready or on fallback */}
            {(aiResult || aiTimedOut) && (
              <div className="mb-4 space-y-3">
                <AiCard
                  title="Kesimpulan"
                  content={
                    aiResult?.aiConclusion ??
                    getFallbackText('conclusion', state.binaryRiskLevel ?? 'LOW')
                  }
                />
                <AiCard
                  title="Untuk Kamu"
                  content={
                    aiResult?.aiPerceptionResponse ??
                    getFallbackText('perception', state.binaryRiskLevel ?? 'LOW')
                  }
                />
                <AiCard
                  title="Yang Perlu Dilakukan"
                  content={
                    aiResult?.aiRecommendation ??
                    getFallbackText('recommendation', state.binaryRiskLevel ?? 'LOW')
                  }
                  isList
                />
                <AiCard
                  title="Saran"
                  content={
                    aiResult?.aiSuggestion ??
                    getFallbackText('suggestion', state.binaryRiskLevel ?? 'LOW')
                  }
                />
              </div>
            )}

            {/* Scoring Detail */}
            <div className="mb-4 rounded-lg bg-[#f7f4ee] p-3 text-[11px]">
              <p className="mb-2 font-semibold text-[#6b5e4f]">Gejala Kunci</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Gatal Malam</span>
                  <span
                    className={
                      state.binaryScoringState?.gatalMalam
                        ? 'text-emerald-600 font-bold'
                        : 'text-[#b9b2a3]'
                    }
                  >
                    {state.binaryScoringState?.gatalMalam ? '● Ya' : '○ Tidak'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Kontak Serupa</span>
                  <span
                    className={
                      state.binaryScoringState?.kontakSerupa
                        ? 'text-emerald-600 font-bold'
                        : 'text-[#b9b2a3]'
                    }
                  >
                    {state.binaryScoringState?.kontakSerupa ? '● Ya' : '○ Tidak'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Lokasi Khas</span>
                  <span
                    className={
                      state.binaryScoringState?.lokasiKhas
                        ? 'text-emerald-600 font-bold'
                        : 'text-[#b9b2a3]'
                    }
                  >
                    {state.binaryScoringState?.lokasiKhas ? '● Ya' : '○ Tidak'}
                  </span>
                </div>
              </div>
              <p className="mb-2 mt-3 font-semibold text-[#6b5e4f]">Faktor Tambahan</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Asrama/Pondok</span>
                  <span
                    className={
                      state.binaryScoringState?.asrama
                        ? 'text-emerald-600 font-bold'
                        : 'text-[#b9b2a3]'
                    }
                  >
                    {state.binaryScoringState?.asrama ? '● Ya' : '○ Tidak'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tukar Alat Pribadi</span>
                  <span
                    className={
                      state.binaryScoringState?.tukarAlat
                        ? 'text-emerald-600 font-bold'
                        : 'text-[#b9b2a3]'
                    }
                  >
                    {state.binaryScoringState?.tukarAlat ? '● Ya' : '○ Tidak'}
                  </span>
                </div>
              </div>
            </div>

            {/* Perception */}
            {state.perception && (
              <div className="mb-4 rounded-lg bg-[#f7f4ee] p-3 text-[11px]">
                <p className="mb-1 font-semibold text-[#6b5e4f]">Persepsi</p>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    state.perception === 'BARRIER'
                      ? 'bg-orange-50 text-orange-700'
                      : state.perception === 'OVERESTIMATE'
                        ? 'bg-red-50 text-red-600'
                        : state.perception === 'UNDERESTIMATE'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {state.perception}
                </span>
              </div>
            )}

            {/* Dimensions */}
            <div className="rounded-lg bg-[#f7f4ee] p-3 text-[11px]">
              <p className="mb-2 font-semibold text-[#6b5e4f]">Dimensi Terisi</p>
              <div className="space-y-1">
                {Object.entries(state.dimensiDetail).map(([dim, detail]) => (
                  <div key={dim}>
                    <span className="font-medium text-[#4a4035]">{dim}</span>
                    {detail.keywords.length > 0 && (
                      <span className="ml-2 text-[#8a8070]">{detail.keywords.join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Close button */}
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setShowResult(false)}
                className="rounded-full border border-[#e2ddd0] bg-white px-5 py-2 text-[11px] font-medium text-[#6b5e4f] transition hover:bg-[#f7f4ee]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** AI result card — renders a titled section with text or list content */
function AiCard({
  title,
  content,
  isList = false,
}: {
  title: string;
  content: string;
  isList?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#e2ddd0] bg-white p-3 text-[11px] shadow-sm">
      <p className="mb-1.5 font-semibold text-[#4a4035]">{title}</p>
      {isList ? (
        <ul className="list-inside list-disc space-y-1 text-[#6b5e4f]">
          {content
            .split('\n')
            .filter((line) => line.trim())
            .map((line, idx) => (
              <li key={idx}>{line.trim()}</li>
            ))}
        </ul>
      ) : (
        <p className="whitespace-pre-wrap text-[#6b5e4f]">{content}</p>
      )}
    </div>
  );
}

/** Inline turn summary — shows badge + link to panel, NO feedback buttons */
function InlineTurnSummary({
  turn,
  delta,
  isSelected,
  onSelect,
}: {
  turn: TurnDetail;
  delta: number | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const catCount = turn.extraction
    ? Object.values(turn.extraction).filter((arr) => Array.isArray(arr) && arr.length > 0).length
    : 0;

  return (
    <div className="mt-2 flex items-center gap-2 pl-1">
      {/* Turn info (clickable → selects in scoring panel) */}
      <button
        onClick={onSelect}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition ${
          isSelected
            ? 'border-[#d9a319] bg-[#fef9e7] text-[#8a6d13] ring-1 ring-[#d9a319]/30'
            : 'border-[#e2ddd0] bg-[#f7f4ee] text-[#6b5e4f] hover:border-[#d9a319]/50 hover:bg-[#fef9e7]/50'
        }`}
      >
        <span className="text-[8px] text-[#b9b2a3]">▸</span>
        <span className="font-bold">Turn {turn.turnNumber}</span>
        <span className="text-[#cfc9bd]">·</span>
        <span>{catCount} cat</span>
        {delta !== null && (
          <>
            <span className="text-[#cfc9bd]">·</span>
            <span className="font-bold text-emerald-600">+{delta}</span>
          </>
        )}
      </button>

      {/* Feedback badge (read-only display) */}
      {turn.feedback && (
        <span
          className={`rounded-md px-2 py-0.5 text-[9px] font-bold ${
            turn.feedback.isAccurate ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {turn.feedback.isAccurate ? '✓ accurate' : '✗ inaccurate'}
        </span>
      )}
    </div>
  );
}

// --- ChipsPanel: select-then-submit chips UI (matches chat app behavior) ---

function ChipsPanel({
  request,
  selections,
  onToggle,
  onSubmit,
  disabled,
}: {
  request: ChipsRequestData;
  selections: string[];
  onToggle: (token: string, group?: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const isGrouped = request.groups && request.groups.length > 0;

  // Validation: check if selection is complete
  const isValid = (() => {
    if (isGrouped && request.groups) {
      return request.groups.every((g) => g.options.some((o) => selections.includes(o.token)));
    }
    if (request.type === 'single') return selections.length === 1;
    return selections.length > 0;
  })();

  return (
    <div className="border-t border-[#e2ddd0] bg-[#faf8f4] px-6 py-3">
      <div className="mx-auto max-w-2xl">
        {isGrouped && request.groups ? (
          // Grouped mode (asrama_tukar)
          <div className="space-y-3">
            {request.groups.map((group) => (
              <div key={group.id}>
                <p className="mb-1.5 text-[10px] font-semibold text-[#6b5e4f]">{group.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((option) => (
                    <button
                      key={option.token}
                      onClick={() => onToggle(option.token, group.id)}
                      disabled={disabled}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                        selections.includes(option.token)
                          ? 'border-[#d9a319] bg-[#fef9e7] text-[#8a6d13]'
                          : 'border-[#e2ddd0] bg-white text-[#4a4035] hover:border-[#d9a319] hover:bg-[#fdf8ec]'
                      } disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat mode (single or multi)
          <div>
            {request.question && (
              <p className="mb-2 text-[11px] font-medium text-[#6b5e4f]">{request.question}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {request.options.map((option) => (
                <button
                  key={option.token}
                  onClick={() => onToggle(option.token)}
                  disabled={disabled}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                    selections.includes(option.token)
                      ? 'border-[#d9a319] bg-[#fef9e7] text-[#8a6d13]'
                      : 'border-[#e2ddd0] bg-white text-[#4a4035] hover:border-[#d9a319] hover:bg-[#fdf8ec]'
                  } disabled:opacity-50`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={onSubmit}
            disabled={disabled || !isValid}
            className="rounded-full bg-[#4a4035] px-4 py-1.5 text-[11px] font-bold text-[#f4f1ea] shadow-sm transition hover:bg-[#3a3228] disabled:opacity-30"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}
