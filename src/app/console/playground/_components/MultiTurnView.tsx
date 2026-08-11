'use client';

import { useState, useRef, useEffect } from 'react';
import { usePlaygroundContext } from './PlaygroundContext';
import { GuidancePreview } from './GuidancePreview';
import { CONFIG } from '@/lib/config';

const MAX_TURNS = CONFIG.sessionLimits.MAX_TURNS;

// --- Local ChatBubble (no shared component exists yet) ---

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-[12px] leading-relaxed ${
          isUser
            ? 'bg-[#e9f0f8] text-[#2d4a6f] border border-[#cfdcec] rounded-tr-sm'
            : 'bg-[#f3f1ea] text-[#4a4035] border border-[#e2ddd0] rounded-tl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

// --- Local ScoringPanel (simplified, for playground scoring display) ---

function ScoringPanel({
  scoring,
}: {
  scoring: {
    totalScore: number;
    riskLevel: string;
    scores: Record<string, { capped: number; matchedPatterns: string[] }>;
  };
}) {
  const riskColors: Record<string, string> = {
    LOW: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    MODERATE: 'bg-amber-100 text-amber-700 border-amber-200',
    HIGH: 'bg-red-100 text-red-700 border-red-200',
  };

  const colorClass = riskColors[scoring.riskLevel] ?? 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className="ml-0 mt-1.5 max-w-[75%] rounded-lg border border-[#e2ddd0] bg-[#fcfbf7] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#b9b2a3]">
          Scoring
        </span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${colorClass}`}>
          {scoring.riskLevel} ({scoring.totalScore})
        </span>
      </div>
      <div className="space-y-1">
        {Object.entries(scoring.scores).map(([category, data]) => (
          <div key={category} className="flex items-start gap-2">
            <span className="min-w-[90px] text-[10px] font-medium text-[#6b5e4f]">{category}</span>
            <span className="text-[10px] font-bold text-emerald-600">
              {data.capped > 0 ? `+${data.capped}` : '—'}
            </span>
            {data.matchedPatterns.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {data.matchedPatterns.map((kw, i) => (
                  <span
                    key={i}
                    className="rounded border border-[#e2ddd0] bg-[#f7f4ee] px-1 py-0.5 text-[8px] text-[#6b5e4f]"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MultiTurnView ---

export function MultiTurnView() {
  const { state, sendMessage, resetConversation } = usePlaygroundContext();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = state.multiTurnMessages;
  const currentTurn = Math.ceil(messages.filter((m) => m.role === 'user').length);
  const sessionComplete = currentTurn >= MAX_TURNS;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending || sessionComplete) return;

    const message = input.trim();
    setInput('');
    setSending(true);
    try {
      await sendMessage(message);
    } finally {
      setSending(false);
    }
  };

  // Find scoring data for a specific assistant message (by index in conversation)
  const getScoringForTurn = (
    assistantIndex: number,
  ): {
    totalScore: number;
    riskLevel: string;
    scores: Record<string, { capped: number; matchedPatterns: string[] }>;
  } | null => {
    // Results in multi-turn are stored per-turn in results array
    // The turn number corresponds to the assistant message position
    const turnNumber = assistantIndex + 1;
    const result = state.results.find(
      (r) => r.response?.turnNumber === turnNumber && r.response?.scoring,
    );
    return result?.response?.scoring ?? null;
  };

  // Count assistant messages for turn tracking
  let assistantCount = 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header bar with turn counter + reset */}
      <div className="flex items-center justify-between border-b border-[#e2ddd0] bg-[#f7f4ee] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#6b5e4f]">
            Turn {currentTurn}/{MAX_TURNS}
          </span>
          {sessionComplete && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
              Session complete
            </span>
          )}
        </div>
        <button
          onClick={resetConversation}
          disabled={messages.length === 0}
          className="rounded-lg border border-[#e2ddd0] bg-white px-3 py-1.5 text-[10px] font-medium text-[#6b5e4f] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Reset Conversation
        </button>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.length === 0 && !sending && (
            <p className="py-16 text-center text-[11px] text-[#b9b2a3]">
              Mulai percakapan multi-turn...
            </p>
          )}

          {messages.map((msg, i) => {
            const isAssistant = msg.role === 'assistant';
            let scoring = null;

            if (isAssistant) {
              scoring = state.enableScoring ? getScoringForTurn(assistantCount) : null;
              assistantCount++;
            }

            return (
              <div key={i}>
                <ChatBubble role={msg.role} content={msg.content} />
                {isAssistant && scoring && <ScoringPanel scoring={scoring} />}
              </div>
            );
          })}

          {/* Loading indicator */}
          {sending && (
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
              waiting for response...
            </div>
          )}
        </div>
      </div>

      {/* Guidance preview */}
      {state.guidance && (
        <div className="border-t border-[#e2ddd0] bg-white px-6 py-3">
          <div className="mx-auto max-w-2xl">
            <GuidancePreview guidance={state.guidance} variant="full" />
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[#e2ddd0] bg-[#f7f4ee] px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sessionComplete ? 'Session selesai (maks 7 turn)' : 'Ketik pesan...'}
            disabled={sending || sessionComplete}
            className="flex-1 rounded-full border border-[#e2ddd0] bg-white px-5 py-2.5 text-[12px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-2 focus:ring-[#d9a319]/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || sessionComplete}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4a4035] text-[#f4f1ea] shadow-md transition hover:bg-[#3a3228] disabled:opacity-30"
            aria-label="Kirim pesan"
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
    </div>
  );
}
