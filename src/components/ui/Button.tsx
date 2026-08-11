import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type ButtonVariant = 'primary' | 'secondary' | 'outlined';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary text-text-cream border-2 border-border-strong shadow-sticker-lg',
  secondary: 'bg-surface-card text-text-strong border-2 border-border-strong shadow-sticker-md',
  outlined: 'bg-surface-card text-text-strong border-2 border-border-subtle shadow-sticker-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2.5 text-[12.5px] rounded-input',
  md: 'px-4 py-3.5 text-[14.5px] rounded-card',
  lg: 'px-4 py-4 text-[16.5px] rounded-button',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'cursor-pointer font-display font-normal transition-transform active:scale-[0.98]',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
