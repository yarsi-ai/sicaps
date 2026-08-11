'use client';

import { useTestingContext } from './TestingContext';
import { ExportButton } from './ExportButton';

const STATUS_CONFIG = {
  connected: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200',
    label: 'connected',
    text: 'text-emerald-700',
  },
  streaming: {
    dot: 'bg-amber-500 animate-pulse',
    ring: 'ring-amber-200',
    label: 'streaming',
    text: 'text-amber-700',
  },
  error: { dot: 'bg-red-500', ring: 'ring-red-200', label: 'disconnected', text: 'text-red-600' },
  checking: {
    dot: 'bg-stone-400 animate-pulse',
    ring: 'ring-stone-200',
    label: 'checking',
    text: 'text-stone-500',
  },
} as const;

/**
 * Testing page actions — connection status, inspector toggle, export.
 * Rendered inside ConsoleNav's actions slot.
 */
export function TestingActions() {
  const { state, toggleInspector } = useTestingContext();
  const status = STATUS_CONFIG[state.connectionStatus];

  return (
    <>
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ${status.dot} ${status.ring}`}
        />
        <span className={`text-[10px] font-semibold ${status.text}`}>{status.label}</span>
      </div>

      {/* Inspector toggle */}
      <button
        onClick={toggleInspector}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-medium transition ${
          state.inspectorOpen
            ? 'border-[#4a4035] bg-[#4a4035] text-white'
            : 'border-[#e2ddd0] bg-white text-[#6b5e4f] hover:border-[#cfc9bd]'
        }`}
      >
        <span
          className={`relative h-2 w-4 rounded-full ${state.inspectorOpen ? 'bg-emerald-400' : 'bg-[#e2ddd0]'}`}
        >
          <span
            className={`absolute top-0.5 h-1 w-1 rounded-full bg-white transition-all ${state.inspectorOpen ? 'right-0.5' : 'left-0.5'}`}
          />
        </span>
        Inspector
      </button>

      {/* Export */}
      <ExportButton />
    </>
  );
}
