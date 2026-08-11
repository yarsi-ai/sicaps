'use client';

import { useState, useRef, useEffect } from 'react';

import { usePlaygroundContext } from './PlaygroundContext';

/**
 * Export button for playground experiment data.
 * Triggers CSV download via the evaluations export endpoint with source=playground filter.
 */
export function ExportButton() {
  const { state } = usePlaygroundContext();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine the current sessionId based on mode
  const currentSessionId = resolveCurrentSessionId(state);

  // Disable when no results exist at all
  const hasResults =
    state.results.length > 0 ||
    state.multiTurnMessages.length > 0 ||
    state.compareResults.left !== null ||
    state.compareResults.right !== null;

  function handleExport(scope: 'session' | 'all'): void {
    setOpen(false);
    const params = new URLSearchParams({ source: 'playground' });
    if (scope === 'session' && currentSessionId) {
      params.set('sessionId', currentSessionId);
    }
    window.open(`/api/test/evaluations/export?${params.toString()}`, '_blank');
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={!hasResults}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded-lg border border-[#e2ddd0] bg-white px-3 py-1.5 text-[11px] font-medium text-[#6b5e4f] transition hover:border-[#cfc9bd] hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <DownloadIcon />
        Export
        <span className="text-[8px] text-[#b9b2a3]">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-lg border border-[#e2ddd0] bg-white py-1 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={() => handleExport('session')}
            disabled={!currentSessionId}
            className="block w-full px-3 py-2 text-left text-[11px] text-[#4a4035] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:text-[#cfc9bd]"
          >
            Session ini saja
          </button>
          <button
            role="menuitem"
            onClick={() => handleExport('all')}
            className="block w-full px-3 py-2 text-left text-[11px] text-[#4a4035] transition hover:bg-[#f7f4ee]"
          >
            Semua playground data
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Resolves the current session ID depending on the active mode.
 * Multi-turn: uses the active multiTurnSessionId.
 * Single-shot/compare: uses the most recent result's sessionId.
 */
function resolveCurrentSessionId(state: {
  mode: string;
  multiTurnSessionId: string | null;
  results: Array<{ response: { sessionId: string } | null }>;
  compareResults: {
    left: { response: { sessionId: string } | null } | null;
    right: { response: { sessionId: string } | null } | null;
  };
}): string | null {
  if (state.mode === 'multi-turn') {
    return state.multiTurnSessionId;
  }

  if (state.mode === 'compare') {
    return state.compareResults.left?.response?.sessionId ?? null;
  }

  // Single-shot: most recent result with a response
  const latestWithResponse = state.results.find((r) => r.response !== null);
  return latestWithResponse?.response?.sessionId ?? null;
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
