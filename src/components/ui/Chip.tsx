import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cx } from '@/lib/cx';

interface PillChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'pill';
  active?: boolean;
}

interface StatusChipProps {
  variant: 'status';
  bg: string;
  color: string;
  rotated?: boolean;
  className?: string;
  children: React.ReactNode;
}

type ChipProps = PillChipProps | StatusChipProps;

export default function Chip(props: ChipProps) {
  if (props.variant === 'status') {
    const { bg, color, rotated, className, children } = props;
    const style: CSSProperties = {
      background: bg,
      color,
      ...(rotated ? { transform: 'rotate(-1.5deg)' } : {}),
    };
    return (
      <span
        style={style}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12px] font-extrabold',
          className,
        )}
      >
        {children}
      </span>
    );
  }

  const { active, className, ...rest } = props;
  return (
    <button
      className={cx(
        'cursor-pointer rounded-pill border-2 px-4 py-2.5 text-[13.5px] font-bold transition-transform active:scale-[0.98]',
        active
          ? 'border-border-strong bg-brand-primary text-text-cream shadow-sticker-md'
          : 'border-border-subtle bg-surface-card text-text-strong shadow-sticker-sm',
        className,
      )}
      {...rest}
    />
  );
}
