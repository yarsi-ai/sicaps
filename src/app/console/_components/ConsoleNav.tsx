'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const PAGE_NAMES: Record<string, string> = {
  '/console/testing': 'Testing',
  '/console/playground': 'Playground',
};

export interface ConsoleNavProps {
  /** Page-specific actions rendered on the right side */
  actions?: ReactNode;
}

/**
 * Shared console navigation bar.
 * Breadcrumb on left, page actions on right — all in one row.
 * Each page renders this inside its own Provider so actions can access page context.
 */
export function ConsoleNav({ actions }: ConsoleNavProps) {
  const pathname = usePathname();
  const pageName = PAGE_NAMES[pathname] ?? null;

  return (
    <nav className="flex h-12 items-center justify-between border-b border-[#d4cfc4] bg-white px-5">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-[#4a4035] text-[#e2ddd0]">
          <TerminalIcon />
        </span>

        {pageName ? (
          <div className="flex items-center gap-1.5">
            <Link
              href="/console"
              className="text-[11px] font-semibold text-[#8a7e6f] transition hover:text-[#4a4035]"
            >
              SICAPS Console
            </Link>
            <span className="text-[10px] text-[#cfc9bd]" aria-hidden="true">
              ›
            </span>
            <span className="text-[11px] font-bold text-[#4a4035]">{pageName}</span>
          </div>
        ) : (
          <span className="text-[11px] font-bold text-[#4a4035]">SICAPS Console</span>
        )}
      </div>

      {/* Right: Page actions or hub badges */}
      <div className="flex items-center gap-3">{actions ?? <HubBadges />}</div>
    </nav>
  );
}

function HubBadges() {
  return (
    <>
      <span className="rounded-full border border-[#e2ddd0] bg-[#f7f4ee] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#9a9285]">
        Internal
      </span>
      <Link
        href="/"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#8a7e6f] transition hover:bg-[#f7f4ee] hover:text-[#4a4035]"
      >
        <HomeIcon />
        App
      </Link>
    </>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
