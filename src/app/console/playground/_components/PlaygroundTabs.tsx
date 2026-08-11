'use client';

import { usePlaygroundContext, type PlaygroundState } from './PlaygroundContext';

const TABS: Array<{ mode: PlaygroundState['mode']; label: string }> = [
  { mode: 'single-shot', label: 'Single-shot' },
  { mode: 'multi-turn', label: 'Multi-turn' },
  { mode: 'compare', label: 'Compare' },
];

/**
 * Tab switcher for playground modes: Single-shot, Multi-turn, Compare.
 * Full implementation in task 4.4.
 */
export function PlaygroundTabs() {
  const { state, setMode } = usePlaygroundContext();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-1">
      {TABS.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => setMode(mode)}
          className={`rounded-md px-3.5 py-1.5 text-[11px] font-medium transition ${
            state.mode === mode
              ? 'bg-white text-[#4a4035] shadow-sm border border-[#e2ddd0]'
              : 'text-[#8a7e6f] hover:text-[#4a4035] hover:bg-white/50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
