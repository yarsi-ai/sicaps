'use client';

import { useState, useMemo } from 'react';
import {
  usePlaygroundContext,
  type PlaygroundConfig,
  type PlaygroundResult,
  type PlaygroundResponse,
} from './PlaygroundContext';
import { ConfigPanel } from './ConfigPanel';
import { ResponseDisplay } from './ResponseDisplay';
import { MetadataBar } from './MetadataBar';

// ─── Extraction Diff ─────────────────────────────────────────────────────────

function extractKeywords(
  extraction: PlaygroundResponse['extraction'] | null | undefined,
): Set<string> {
  if (!extraction) return new Set();
  const keywords = new Set<string>();
  for (const category of Object.values(extraction)) {
    if (Array.isArray(category)) {
      for (const item of category) {
        if (item.keyword) keywords.add(item.keyword.toLowerCase());
      }
    }
  }
  return keywords;
}

function computeExtractionDiff(
  leftExtraction: PlaygroundResponse['extraction'] | null | undefined,
  rightExtraction: PlaygroundResponse['extraction'] | null | undefined,
): { leftOnly: Set<string>; rightOnly: Set<string> } {
  const leftKeywords = extractKeywords(leftExtraction);
  const rightKeywords = extractKeywords(rightExtraction);

  const leftOnly = new Set<string>();
  const rightOnly = new Set<string>();

  for (const kw of leftKeywords) {
    if (!rightKeywords.has(kw)) leftOnly.add(kw);
  }
  for (const kw of rightKeywords) {
    if (!leftKeywords.has(kw)) rightOnly.add(kw);
  }

  return { leftOnly, rightOnly };
}

// ─── Compare Panel ───────────────────────────────────────────────────────────

function ComparePanel({
  side,
  config,
  result,
  onUpdateConfig,
  diffKeywords,
}: {
  side: 'left' | 'right';
  config: PlaygroundConfig;
  result: PlaygroundResult | null;
  onUpdateConfig: (partial: Partial<PlaygroundConfig>) => void;
  diffKeywords: Set<string>;
}) {
  const isLeft = side === 'left';
  const headerBg = isLeft ? 'bg-[#e8f0fd]' : 'bg-[#fdf0e8]';
  const headerBorder = isLeft ? 'border-[#c8d8f0]' : 'border-[#f0d8c8]';
  const accentColor = isLeft ? 'text-[#3b6cb5]' : 'text-[#b56c3b]';

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Panel header — colored accent strip */}
      <div className={`border-b ${headerBorder} ${headerBg} px-5 py-2.5`}>
        <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${accentColor}`}>
          Config {isLeft ? 'A' : 'B'}
        </span>
      </div>

      {/* Config form */}
      <div className="border-b border-[#e8e4db] bg-[#fdfcf9]">
        <ConfigPanel config={config} onUpdateConfig={onUpdateConfig} compact />
      </div>

      {/* Response area */}
      <div className="flex flex-1 flex-col overflow-y-auto bg-white p-5">
        {result?.loading && <LoadingIndicator />}

        {result?.error && (
          <div className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-[11px] text-red-700">
            <span className="font-semibold">Error:</span> {result.error}
          </div>
        )}

        {result?.response && (
          <div className="space-y-4">
            <MetadataBar
              latencyMs={result.response.metadata.latencyMs}
              model={result.response.metadata.model}
              tokensUsed={result.response.metadata.tokensUsed}
              provider={result.response.metadata.provider}
            />
            <ResponseDisplay
              reply={result.response.reply}
              extraction={result.response.extraction}
              highlightKeywords={diffKeywords}
              highlightColor={isLeft ? 'blue' : 'orange'}
            />
          </div>
        )}

        {!result && (
          <div className="flex flex-1 items-center justify-center py-12">
            <p className="text-[11px] italic text-[#c4bfb4]">Kirim pesan untuk melihat response</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Loading Indicator ───────────────────────────────────────────────────────

function LoadingIndicator() {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="flex items-center gap-2.5">
        <span className="flex gap-1">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#d9a319]"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#d9a319]"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-[#d9a319]"
            style={{ animationDelay: '300ms' }}
          />
        </span>
        <span className="text-[11px] text-[#b9b2a3]">Menunggu response...</span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CompareView() {
  const { state, updateConfig, updateCompareConfig, sendMessage } = usePlaygroundContext();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const { leftOnly, rightOnly } = useMemo(
    () =>
      computeExtractionDiff(
        state.compareResults.left?.response?.extraction,
        state.compareResults.right?.response?.extraction,
      ),
    [
      state.compareResults.left?.response?.extraction,
      state.compareResults.right?.response?.extraction,
    ],
  );

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Comparison container — side-by-side panels */}
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-4 lg:flex-row lg:gap-4">
        {/* Config A (left) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e2ddd0] shadow-sm">
          <ComparePanel
            side="left"
            config={state.config}
            result={state.compareResults.left}
            onUpdateConfig={updateConfig}
            diffKeywords={leftOnly}
          />
        </div>

        {/* Config B (right) */}
        <div className="mt-4 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e2ddd0] shadow-sm lg:mt-0">
          <ComparePanel
            side="right"
            config={state.compareConfig}
            result={state.compareResults.right}
            onUpdateConfig={updateCompareConfig}
            diffKeywords={rightOnly}
          />
        </div>
      </div>

      {/* Extraction diff legend — appears after both respond */}
      {state.compareResults.left?.response && state.compareResults.right?.response && (
        <div className="flex items-center gap-5 border-t border-[#e2ddd0] bg-[#faf8f4] px-6 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8a7e6f]">
            Diff
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#6b5e4f]">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[#e8f0fd] ring-1 ring-[#c8d8f0]" />
            Hanya Config A ({leftOnly.size})
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#6b5e4f]">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[#fdf0e8] ring-1 ring-[#f0d8c8]" />
            Hanya Config B ({rightOnly.size})
          </span>
        </div>
      )}

      {/* Input bar — bottom, consistent with other modes */}
      <div className="border-t border-[#e2ddd0] bg-[#f7f4ee] px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ketik pesan — dikirim ke kedua config..."
            disabled={sending}
            className="flex-1 rounded-full border border-[#e2ddd0] bg-white px-5 py-2.5 text-[12px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-2 focus:ring-[#d9a319]/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4a4035] text-[#f4f1ea] shadow-md transition hover:bg-[#3a3228] active:scale-95 disabled:opacity-30"
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
