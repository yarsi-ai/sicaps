import type { ReactNode } from 'react';

interface AppFooterProps {
  children: ReactNode;
  /** Show a 2px ink border line above the footer. */
  border?: boolean;
  /** Show a gradient fade-up overlay above the footer. */
  gradient?: boolean;
  /** Custom gradient end color (defaults to surface-alt). Landing uses surface-card. */
  gradientColor?: string;
  /** Remove padding (for input bar that needs edge-to-edge). */
  noPadding?: boolean;
}

/**
 * Unified footer shell used across all pages.
 * Guarantees consistent padding and spacing so bottom CTAs
 * don't shift when navigating between pages.
 *
 * - Padding: px-6.5 pb-6.5 pt-3 (disabled with noPadding for input bar)
 * - Children layout: flex column with gap-3
 * - Optional border line above
 * - Optional gradient fade above
 */
export default function AppFooter({
  children,
  border = false,
  gradient = false,
  gradientColor,
  noPadding = false,
}: AppFooterProps) {
  return (
    <div className="relative flex-none">
      {gradient && (
        <div
          className="pointer-events-none absolute inset-x-0 -top-8 h-8"
          style={{
            background: `linear-gradient(180deg, transparent, ${gradientColor ?? 'var(--color-surface-alt)'})`,
          }}
          aria-hidden="true"
        />
      )}
      {border && <div className="h-[2px] bg-border-strong" />}
      <div
        className={noPadding ? '' : 'flex flex-col gap-3 px-6.5 pt-1 pb-6.5'}
        style={
          noPadding ? undefined : { paddingBottom: 'max(1.625rem, env(safe-area-inset-bottom))' }
        }
      >
        {children}
      </div>
    </div>
  );
}
