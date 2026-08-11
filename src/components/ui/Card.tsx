import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type CardVariant = 'default' | 'dashed' | 'amber-wash';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'bg-surface-card border-[1.5px] border-border-subtle',
  dashed: 'bg-surface-card border-2 border-dashed border-border-dashed',
  'amber-wash': 'bg-amber-wash-bg border-2 border-dashed border-amber-wash-border',
};

export default function Card({ variant = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={cx('rounded-card px-4 py-3.5', VARIANT_CLASSES[variant], className)}
      {...props}
    />
  );
}
