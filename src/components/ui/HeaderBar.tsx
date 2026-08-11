import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import BackButton from './BackButton';

interface HeaderBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  rightSlot?: ReactNode;
}

/**
 * Standard page header with back button + title + optional right slot.
 * Built on top of AppHeader for guaranteed consistent sizing.
 */
export default function HeaderBar({
  title,
  subtitle,
  onBack,
  backLabel,
  rightSlot,
}: HeaderBarProps) {
  return (
    <AppHeader
      left={<BackButton label={backLabel} onClick={onBack} />}
      center={
        <>
          <div className="font-display text-[16.5px] font-normal text-text-strong">{title}</div>
          {subtitle && <div className="text-xs font-semibold text-text-muted">{subtitle}</div>}
        </>
      }
      right={rightSlot}
    />
  );
}
