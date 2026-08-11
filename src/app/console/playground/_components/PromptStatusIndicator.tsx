'use client';

import { useCallback, useState } from 'react';
import { usePlaygroundContext } from './PlaygroundContext';

/**
 * Shows whether the current system prompt is "Production (auto-generated)" or
 * "Custom (manually edited)". Displays a "Reset to Production" button when status is 'custom'.
 */
export function PromptStatusIndicator() {
  const { state, resetToProduction } = usePlaygroundContext();
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      await resetToProduction();
    } finally {
      setResetting(false);
    }
  }, [resetToProduction]);

  const isProduction = state.promptStatus === 'production';

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[#e2ddd0] bg-[#faf8f4] px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${isProduction ? 'bg-emerald-500' : 'bg-amber-500'}`}
          aria-hidden="true"
        />
        <span className="text-[11px] text-[#6b5e4f]">
          {isProduction ? 'Production prompt (auto-generated)' : 'Custom prompt (edited)'}
        </span>
      </div>
      {!isProduction && (
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-[#d9a319] hover:bg-[#d9a319]/10 disabled:opacity-50"
        >
          {resetting ? 'Resetting...' : 'Reset to Production'}
        </button>
      )}
    </div>
  );
}
