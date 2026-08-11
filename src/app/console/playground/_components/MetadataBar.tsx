export interface MetadataBarProps {
  latencyMs: number;
  model: string;
  tokensUsed: { input: number; output: number } | null;
  provider: string;
}

/**
 * Horizontal bar with badges showing latency, provider/model, and token count.
 * Shared by SingleShotResult, MultiTurnView, and CompareView.
 */
export function MetadataBar({ latencyMs, model, tokensUsed, provider }: MetadataBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Latency badge */}
      <span className="inline-flex items-center gap-1 rounded-md border border-[#e2ddd0] bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-medium text-[#6b5e4f]">
        <ClockIcon />
        {latencyMs}ms
      </span>

      {/* Provider + Model badge */}
      <span className="inline-flex items-center gap-1 rounded-md border border-[#e2ddd0] bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-medium text-[#6b5e4f]">
        <CpuIcon />
        <span className="text-[#b9b2a3]">{provider}</span>
        <span className="text-[#b9b2a3]">/</span>
        {model}
      </span>

      {/* Tokens badge */}
      {tokensUsed && (
        <span className="inline-flex items-center gap-1 rounded-md border border-[#e2ddd0] bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-medium text-[#6b5e4f]">
          <TokenIcon />
          {tokensUsed.input} in / {tokensUsed.output} out
        </span>
      )}
    </div>
  );
}

// --- Inline SVG icons (14x14) ---

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

function TokenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
