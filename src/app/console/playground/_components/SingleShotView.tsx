'use client';

import { useState } from 'react';
import { usePlaygroundContext } from './PlaygroundContext';
import { GuidancePreview } from './GuidancePreview';
import { SingleShotResult } from './SingleShotResult';

// --- Component ---

export function SingleShotView() {
  const { state, sendMessage } = usePlaygroundContext();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const message = input.trim();
    setInput('');
    setSending(true);

    try {
      await sendMessage(message);
    } finally {
      setSending(false);
    }
  };

  // Results sorted newest-first (reverse chronological)
  const sortedResults = [...state.results].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Results list */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-4">
          {sortedResults.length === 0 && (
            <p className="py-16 text-center text-[11px] text-[#b9b2a3]">
              Kirim pesan untuk melihat hasil single-shot...
            </p>
          )}

          {sortedResults.map((result) => (
            <SingleShotResult key={result.id} result={result} />
          ))}
        </div>
      </div>

      {/* Guidance badge — static first-turn guidance */}
      <div className="border-t border-[#e2ddd0] bg-white px-6 py-2">
        <div className="mx-auto max-w-2xl">
          {state.guidance ? (
            <GuidancePreview guidance={state.guidance} variant="badge" />
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[#e2ddd0] bg-[#f7f4ee] px-2.5 py-1 text-[10px] text-[#6b5e4f]">
              <span className="text-[#b9b2a3]">ⓘ</span>
              <span>Turn 1: EXPLORE intensitas</span>
            </div>
          )}
        </div>
      </div>

      {/* Input area — bottom */}
      <div className="border-t border-[#e2ddd0] bg-[#f7f4ee] px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ketik pesan untuk single-shot test..."
            disabled={sending}
            className="flex-1 rounded-full border border-[#e2ddd0] bg-white px-5 py-2.5 text-[12px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-2 focus:ring-[#d9a319]/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4a4035] text-[#f4f1ea] shadow-md transition hover:bg-[#3a3228] disabled:opacity-30"
            aria-label="Send message"
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
              aria-hidden="true"
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
