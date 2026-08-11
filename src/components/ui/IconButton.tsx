import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type IconButtonVariant = 'default' | 'active';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: 'bg-surface-card border-2 border-border-subtle shadow-sticker-sm text-text-strong',
  active: 'bg-brand-primary border-2 border-brand-primary text-text-cream shadow-sticker-md',
};

/**
 * Icon button with a fixed 38×38px visual size.
 * No extra outer padding — the button IS the 38px square.
 * This ensures consistent alignment in headers without positional shifts.
 */
export default function IconButton({
  variant = 'default',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center rounded-xl',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
