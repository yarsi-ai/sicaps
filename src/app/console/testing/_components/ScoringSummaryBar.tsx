'use client';

import { deriveDisplayState } from './derive-state';
import { parseInstruction } from './parse-instruction';
import { useTestingContext } from './TestingContext';

const RISK_STYLES: Record<string, string> = {
  HIGH: 'bg-red-500 text-white',
  MODERATE: 'bg-[#d9a319] text-[#4a4035]',
  LOW: 'bg-emerald-500 text-white',
};

const THEME_STYLES: Record<string, string> = {
  playful: 'bg-blue-100 text-blue-700',
  hybrid: 'bg-purple-100 text-purple-700',
};

const PERCEPTION_STYLES: Record<string, string> = {
  ADEQUATE: 'bg-emerald-100 text-emerald-700',
  UNDERESTIMATE: 'bg-yellow-100 text-yellow-700',
  OVERESTIMATE: 'bg-yellow-100 text-yellow-700',
  BARRIER: 'bg-yellow-100 text-yellow-700',
};

export function ScoringSummaryBar() {
  const { state } = useTestingContext();

  if (!state.sessionId) return null;

  const riskLevel = state.binaryRiskLevel;
  const scoringState = state.binaryScoringState;
  const gejalaCount = scoringState
    ? [scoringState.gatalMalam, scoringState.kontakSerupa, scoringState.lokasiKhas].filter(Boolean)
        .length
    : 0;
  const faktorCount = scoringState
    ? [scoringState.asrama, scoringState.tukarAlat].filter(Boolean).length
    : 0;
  const chipsAnswered = state.chipsAnswered.length;

  // Row 2 derived values
  const displayState = deriveDisplayState(
    state.sessionStatus,
    state.scoring?.categoriesCovered ?? [],
    state.sessionMetadata ?? null,
    state.turns.length,
    state.phase,
  );

  const offTopicCount = (state.sessionMetadata?.offTopicCount as number) ?? 0;
  const shortAnswerCount = (state.sessionMetadata?.shortAnswerCount as number) ?? 0;

  const lastTurn = state.turns[state.turns.length - 1];
  const parsedInstruction = parseInstruction(lastTurn?.log.systemMessage ?? '');

  return (
    <div>
      {/* Row 1 — Binary scoring summary */}
      <div className="flex items-center gap-4 border-b border-[#e2ddd0] bg-[#f7f4ee] px-6 py-2.5">
        {/* Gejala / Faktor counts */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-black tabular-nums text-[#4a4035]">
            {gejalaCount}/{faktorCount}
          </span>
          <span className="text-[10px] font-medium text-[#8a8070]">gejala/faktor</span>
        </div>

        {/* Risk badge */}
        {riskLevel && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${RISK_STYLES[riskLevel] || 'bg-[#e2ddd0] text-[#4a4035]'}`}
          >
            {riskLevel}
          </span>
        )}

        {/* Chips progress */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#8a8070]">
            chips <span className="font-bold text-[#4a4035]">{chipsAnswered}/4</span>
          </span>
          <div className="flex gap-0.5">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${i < chipsAnswered ? 'bg-blue-400' : 'bg-[#dcd6c8]'}`}
              />
            ))}
          </div>
        </div>

        {/* Prompt version */}
        <span className="ml-auto rounded-md border border-[#e2ddd0] bg-white px-2.5 py-0.5 text-[9px] font-medium text-[#8a8070]">
          prompt {state.promptVersion}
        </span>

        {/* Export JSON */}
        <button
          onClick={async () => {
            if (!state.sessionId) return;
            try {
              const res = await fetch(`/api/test/session/${state.sessionId}/export`);
              const json = await res.json();
              if (!res.ok) return;
              const blob = new Blob([JSON.stringify(json.data, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `session-${state.sessionId.slice(0, 8)}-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              /* ignore */
            }
          }}
          disabled={state.streaming || state.turns.length === 0}
          className="rounded-md border border-[#e2ddd0] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6b5e4f] transition hover:border-[#d9a319] hover:bg-[#fdf8ec] disabled:opacity-30"
        >
          Export JSON
        </button>
      </div>

      {/* Row 2 — Observability badges */}
      <div className="flex items-center gap-3 border-b border-[#e2ddd0] bg-[#faf8f4] px-6 py-2">
        {/* State badge */}
        <span className="rounded-full border border-[#e2ddd0] px-2.5 py-0.5 text-[9px] font-medium text-[#6b6158]">
          {displayState}
        </span>

        {/* Theme badge */}
        {state.theme && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold capitalize ${THEME_STYLES[state.theme]}`}
          >
            {state.theme}
          </span>
        )}

        {/* Perception badge */}
        {state.perception && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold ${PERCEPTION_STYLES[state.perception] || 'bg-gray-100 text-gray-700'}`}
          >
            {state.perception}
          </span>
        )}

        {/* Edge case badges */}
        {offTopicCount > 0 && (
          <span className="rounded-full border border-[#e2ddd0] bg-[#f7f4ee] px-2.5 py-0.5 text-[9px] font-medium text-[#8a8070]">
            Off-topic: {offTopicCount}
          </span>
        )}
        {shortAnswerCount > 0 && (
          <span className="rounded-full border border-[#e2ddd0] bg-[#f7f4ee] px-2.5 py-0.5 text-[9px] font-medium text-[#8a8070]">
            Short: {shortAnswerCount}
          </span>
        )}

        {/* Instruction type label */}
        <span className="ml-auto text-[10px] font-medium text-[#8a8070]">
          {parsedInstruction?.type ?? '—'}
        </span>
      </div>
    </div>
  );
}
