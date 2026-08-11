'use client';

import type { PlaygroundResult, PlaygroundConfig } from './PlaygroundContext';
import { MetadataBar } from './MetadataBar';
import { ResponseDisplay } from './ResponseDisplay';

// --- Props ---

export interface SingleShotResultProps {
  result: PlaygroundResult;
}

// --- Component ---

export function SingleShotResult({ result }: SingleShotResultProps) {
  if (result.loading) {
    return <LoadingCard input={result.input} config={result.config} />;
  }

  if (result.error) {
    return <ErrorCard input={result.input} config={result.config} error={result.error} />;
  }

  if (!result.response) {
    return null;
  }

  return (
    <article className="rounded-xl border border-[#e2ddd0] bg-white shadow-sm">
      {/* User input */}
      <div className="border-b border-[#e2ddd0] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#b9b2a3]">Input</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#4a4035]">{result.input}</p>
      </div>

      {/* Config summary */}
      <div className="border-b border-[#edeae3] bg-[#fcfbf7] px-4 py-2">
        <ConfigSummary config={result.config} />
      </div>

      {/* Response display */}
      <div className="border-b border-[#edeae3] px-4 py-3">
        <ResponseDisplay reply={result.response.reply} extraction={result.response.extraction} />

        {/* Scoring (if available) */}
        {result.response.scoring && <ScoringDisplay scoring={result.response.scoring} />}
      </div>

      {/* Metadata bar */}
      <div className="px-4 py-2">
        <MetadataBar
          latencyMs={result.response.metadata.latencyMs}
          model={result.response.metadata.model}
          tokensUsed={result.response.metadata.tokensUsed}
          provider={result.response.metadata.provider}
        />
      </div>
    </article>
  );
}

// --- Sub-components ---

function ConfigSummary({ config }: { config: PlaygroundConfig }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-[#e9f0f8] px-2 py-0.5 text-[10px] font-semibold text-[#2d4a6f]">
        {config.provider}
      </span>
      <span className="rounded-md border border-[#e2ddd0] px-2 py-0.5 text-[10px] text-[#6b5e4f]">
        {config.model}
      </span>
      <span className="text-[10px] text-[#b9b2a3]">
        temp={config.temperature} · top_p={config.topP}
      </span>
    </div>
  );
}

function ScoringDisplay({
  scoring,
}: {
  scoring: {
    totalScore: number;
    riskLevel: string;
    scores: Record<string, { capped: number; matchedPatterns: string[] }>;
  };
}) {
  return (
    <div className="mt-3 rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#b9b2a3]">
          Scoring
        </span>
        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white">
          {scoring.totalScore} pts
        </span>
        <span className="text-[10px] text-[#6b5e4f]">{scoring.riskLevel}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(scoring.scores)
          .filter(([, cat]) => cat.capped > 0)
          .map(([name, cat]) => (
            <span
              key={name}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700"
            >
              {name}: +{cat.capped}
            </span>
          ))}
      </div>
    </div>
  );
}

// --- Loading state ---

function LoadingCard({ input, config }: { input: string; config: PlaygroundConfig }) {
  return (
    <article className="animate-pulse rounded-xl border border-[#e2ddd0] bg-white shadow-sm">
      <div className="border-b border-[#e2ddd0] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#b9b2a3]">Input</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#4a4035]">{input}</p>
      </div>
      <div className="border-b border-[#edeae3] bg-[#fcfbf7] px-4 py-2">
        <ConfigSummary config={config} />
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="h-3 w-3/4 rounded bg-[#e2ddd0]" />
        <div className="h-3 w-1/2 rounded bg-[#e2ddd0]" />
        <div className="h-3 w-2/3 rounded bg-[#e2ddd0]" />
      </div>
      <div className="flex items-center gap-2 px-4 py-2">
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
        <span className="text-[10px] text-[#d9a319]">waiting for response...</span>
      </div>
    </article>
  );
}

// --- Error state ---

function ErrorCard({
  input,
  config,
  error,
}: {
  input: string;
  config: PlaygroundConfig;
  error: string;
}) {
  return (
    <article className="rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-[#e2ddd0] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#b9b2a3]">Input</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#4a4035]">{input}</p>
      </div>
      <div className="border-b border-[#edeae3] bg-[#fcfbf7] px-4 py-2">
        <ConfigSummary config={config} />
      </div>
      <div className="px-4 py-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-[11px] font-medium text-red-600">⚠ {error}</p>
        </div>
      </div>
    </article>
  );
}
