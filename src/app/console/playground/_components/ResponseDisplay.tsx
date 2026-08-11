'use client';

import { useState } from 'react';
import { MetadataBar, type MetadataBarProps } from './MetadataBar';

export interface ResponseDisplayProps {
  reply: string;
  extraction: Record<string, Array<{ keyword: string; confidence: string | number }>> | null;
  rawJson?: string;
  error?: string | null;
  loading?: boolean;
  metadata?: MetadataBarProps;
  /** Keywords to highlight as unique to this panel (compare mode diff) */
  highlightKeywords?: Set<string>;
  /** Highlight color for diff keywords */
  highlightColor?: 'blue' | 'orange';
}

/**
 * Displays parsed reply, extraction keywords, and collapsible raw JSON.
 * Shared by SingleShotResult, MultiTurnView, and CompareView.
 */
export function ResponseDisplay({
  reply,
  extraction,
  rawJson,
  error,
  loading,
  metadata,
  highlightKeywords,
  highlightColor = 'blue',
}: ResponseDisplayProps) {
  const [jsonExpanded, setJsonExpanded] = useState(false);

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-lg border border-[#e2ddd0] bg-white p-4">
        <div className="h-3 w-3/4 rounded bg-[#e2ddd0]" />
        <div className="h-3 w-1/2 rounded bg-[#e2ddd0]" />
        <div className="h-3 w-5/6 rounded bg-[#e2ddd0]" />
        <div className="mt-4 flex gap-2">
          <div className="h-5 w-16 rounded bg-[#e2ddd0]" />
          <div className="h-5 w-32 rounded bg-[#e2ddd0]" />
          <div className="h-5 w-24 rounded bg-[#e2ddd0]" />
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-[11px] font-bold text-red-700">Error</p>
        <p className="mt-1 text-[11px] text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Metadata bar */}
      {metadata && <MetadataBar {...metadata} />}

      {/* Parsed reply */}
      <div className="rounded-lg border border-[#e2ddd0] bg-white p-4">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">Reply</p>
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#4a4035]">{reply}</p>
      </div>

      {/* Extraction keywords */}
      {extraction && Object.keys(extraction).length > 0 && (
        <div className="rounded-lg border border-[#e2ddd0] bg-white p-4">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
            Extraction
          </p>
          <div className="space-y-2">
            {Object.entries(extraction).map(([category, keywords]) => (
              <ExtractionCategory
                key={category}
                category={category}
                keywords={keywords}
                highlightKeywords={highlightKeywords}
                highlightColor={highlightColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Raw JSON */}
      {rawJson && (
        <div className="rounded-lg border border-[#e2ddd0] bg-white">
          <button
            type="button"
            onClick={() => setJsonExpanded(!jsonExpanded)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[10px] font-bold text-[#8a8070] transition hover:bg-[#f7f4ee]"
            aria-expanded={jsonExpanded}
          >
            <ChevronIcon expanded={jsonExpanded} />
            Raw JSON
          </button>
          {jsonExpanded && (
            <pre className="max-h-64 overflow-auto border-t border-[#e2ddd0] bg-[#2d2a26] p-3 text-[9px] leading-relaxed text-emerald-300">
              {formatJson(rawJson)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function ExtractionCategory({
  category,
  keywords,
  highlightKeywords,
  highlightColor,
}: {
  category: string;
  keywords: Array<{ keyword: string; confidence: string | number }>;
  highlightKeywords?: Set<string>;
  highlightColor: 'blue' | 'orange';
}) {
  if (keywords.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] font-semibold text-[#6b5e4f]">{category}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {keywords.map((kw, i) => {
          const isHighlighted = highlightKeywords?.has(kw.keyword.toLowerCase());
          const highlightClasses =
            highlightColor === 'blue'
              ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200'
              : 'bg-orange-50 border-orange-200 text-orange-700 ring-1 ring-orange-200';

          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${
                isHighlighted ? highlightClasses : 'border-[#e2ddd0] bg-[#f7f4ee] text-[#6b5e4f]'
              }`}
            >
              &ldquo;{kw.keyword}&rdquo;
              {kw.confidence && (
                <span className={`text-[8px] ${isHighlighted ? 'opacity-70' : 'text-[#b9b2a3]'}`}>
                  {kw.confidence}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
