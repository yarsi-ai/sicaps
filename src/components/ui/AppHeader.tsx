import type { ReactNode } from 'react';

interface AppHeaderProps {
  /** Left slot — typically BackButton or Capi logo. */
  left: ReactNode;
  /** Center slot — grows to fill available space (title, avatar+name, etc). */
  center?: ReactNode;
  /** Right slot — typically LanguageSwitcher, incognito toggle, login button. */
  right?: ReactNode;
  /** Show a 2px ink bottom border (used on chat, not on landing/demografis). */
  border?: boolean;
  /** Custom background class (defaults to transparent). */
  bg?: string;
}

/**
 * Unified header shell used across all pages.
 * Guarantees consistent height (64px), padding (26px), and gap (12px)
 * so elements don't shift when navigating between pages.
 *
 * Layout: [left 38px] — gap — [center flex-1] — gap — [right]
 */
export default function AppHeader({ left, center, right, border = false, bg }: AppHeaderProps) {
  return (
    <div
      className={[
        'flex-none overflow-hidden',
        border ? 'relative z-10 rounded-b-card shadow-sticker-md' : '',
        bg ?? '',
      ].join(' ')}
    >
      <header className="flex min-h-16 items-center gap-3 px-6.5 py-4">
        {/* Left slot — fixed width element (38px icon/logo) */}
        {left}

        {/* Center — fills remaining space */}
        <div className="min-w-0 flex-1">{center}</div>

        {/* Right slot */}
        {right}
      </header>
    </div>
  );
}
