'use client';

import { useTestingContext } from './TestingContext';

const OUTPUT_LABELS = [
  { key: 'conclusion', label: 'Kesimpulan' },
  { key: 'perceptionResponse', label: 'Persepsi' },
  { key: 'recommendation', label: 'Rekomendasi' },
  { key: 'suggestion', label: 'Saran' },
] as const;

export function OutputPreview() {
  const { state } = useTestingContext();

  // Only render when COMPLETED and at least one field is non-null
  if (state.sessionStatus !== 'COMPLETED' || !state.output) return null;
  const hasContent = Object.values(state.output).some((v) => v !== null);
  if (!hasContent) return null;

  return (
    <div className="border-t border-[#e2ddd0] p-4">
      <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">Output</p>
      <div className="space-y-2">
        {OUTPUT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-[#e2ddd0] bg-white p-3">
            <p className="mb-1 text-[9px] font-bold text-[#8a8070]">{label}</p>
            <p className="text-[11px] leading-relaxed text-[#4a4035]">
              {state.output?.[key as keyof typeof state.output] ?? '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
