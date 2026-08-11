'use client';

import { usePlaygroundContext } from './PlaygroundContext';

/**
 * Toggle switch for enabling/disabling scoring in playground.
 * Full implementation in task 4.5.
 */
export function ScoringToggle() {
  const { state, toggleScoring } = usePlaygroundContext();

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="text-[10px] font-medium text-[#6b5e4f]">Scoring</span>
      <button
        type="button"
        role="switch"
        aria-checked={state.enableScoring}
        onClick={toggleScoring}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          state.enableScoring ? 'bg-[#4a4035]' : 'bg-[#dcd6c8]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            state.enableScoring ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  );
}
