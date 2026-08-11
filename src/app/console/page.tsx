import Link from 'next/link';
import { ConsoleNav } from './_components/ConsoleNav';

export default function ConsolePage() {
  return (
    <div className="flex flex-1 flex-col">
      <ConsoleNav />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-5 py-10">
          {/* Page heading */}
          <div className="mb-8">
            <h2 className="text-[18px] font-bold text-[#4a4035]">Developer Tools</h2>
            <p className="mt-1.5 text-[12px] text-[#8a7e6f]">
              Internal tools for testing and debugging SICAPS.
            </p>
          </div>

          {/* Tool cards */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Testing Dashboard */}
            <Link
              href="/console/testing"
              className="group rounded-xl border border-[#e2ddd0] bg-[#fcfbf7] p-6 shadow-sm transition hover:border-[#c8d8f0] hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f0fd]">
                  <BeakerIcon />
                </div>
                <h3 className="text-[13px] font-bold text-[#4a4035] group-hover:text-[#3b6cb5]">
                  Testing Dashboard
                </h3>
              </div>
              <p className="text-[11px] leading-relaxed text-[#8a7e6f]">
                Run screening sessions with full observability. View raw responses, scoring
                breakdowns, and submit accuracy feedback.
              </p>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-[#3b6cb5]">
                Open <span aria-hidden="true">→</span>
              </div>
            </Link>

            {/* Playground */}
            <Link
              href="/console/playground"
              className="group rounded-xl border border-[#e2ddd0] bg-[#fcfbf7] p-6 shadow-sm transition hover:border-[#f0d8c8] hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fdf5e8]">
                  <BoltIcon />
                </div>
                <h3 className="text-[13px] font-bold text-[#4a4035] group-hover:text-[#b57a2e]">
                  Playground
                </h3>
              </div>
              <p className="text-[11px] leading-relaxed text-[#8a7e6f]">
                Experiment with LLM configurations. Compare providers, tune parameters, and evaluate
                extraction quality side-by-side.
              </p>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-[#b57a2e]">
                Open <span aria-hidden="true">→</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function BeakerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b6cb5"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#b57a2e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
