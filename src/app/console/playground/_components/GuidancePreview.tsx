'use client';

import type { GuidanceInfo } from './PlaygroundContext';

interface GuidancePreviewProps {
  guidance: GuidanceInfo | null;
  variant?: 'full' | 'badge';
}

/**
 * Read-only info panel showing current guidance state from production logic.
 *
 * Two variants:
 * - "full" (multi-turn): complete card with all 4 fields + disclaimer
 * - "badge" (single-shot): compact inline badge showing turn 1 guidance
 */
export function GuidancePreview({ guidance, variant = 'full' }: GuidancePreviewProps) {
  if (!guidance) return null;

  if (variant === 'badge') {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-[#e2ddd0] bg-[#f7f4ee] px-2.5 py-1 text-[10px] text-[#6b5e4f]">
        <span className="text-[#b9b2a3]">ⓘ</span>
        <span>
          Turn 1: {guidance.instruction} {guidance.targetCategory ?? ''}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[#b9b2a3]">ⓘ</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#b9b2a3]">
          Guidance Preview
        </span>
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex gap-2">
          <span className="min-w-[70px] text-[#9a9285]">Instruction</span>
          <span className="font-medium text-[#4a4035]">{guidance.instruction}</span>
        </div>
        <div className="flex gap-2">
          <span className="min-w-[70px] text-[#9a9285]">Target</span>
          <span className="font-medium text-[#4a4035]">{guidance.targetCategory ?? '—'}</span>
        </div>
        <div className="flex gap-2">
          <span className="min-w-[70px] text-[#9a9285]">Follow-up</span>
          <span className="font-medium text-[#4a4035]">{guidance.isFollowUp ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex gap-2">
          <span className="min-w-[70px] text-[#9a9285]">Reason</span>
          <span className="font-medium text-[#4a4035]">{guidance.reason}</span>
        </div>
      </div>

      <p className="mt-2 text-[9px] italic text-[#b9b2a3]">
        Informational — tidak mengubah prompt yang dikirim
      </p>
    </div>
  );
}
