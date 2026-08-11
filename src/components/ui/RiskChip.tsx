import type { RiskKey } from '@/types/screening-ui';
import Chip from './Chip';

interface RiskChipProps {
  level: RiskKey;
  label: string;
  rotated?: boolean;
  className?: string;
}

const RISK_COLORS: Record<RiskKey, { bg: string; color: string }> = {
  tinggi: { bg: 'var(--color-risk-high-bg)', color: 'var(--color-risk-high-text)' },
  sedang: { bg: 'var(--color-risk-medium-bg)', color: 'var(--color-risk-medium-text)' },
  rendah: { bg: 'var(--color-risk-low-bg)', color: 'var(--color-risk-low-text)' },
};

export default function RiskChip({ level, label, rotated, className }: RiskChipProps) {
  const { bg, color } = RISK_COLORS[level];
  return (
    <Chip variant="status" bg={bg} color={color} rotated={rotated} className={className}>
      {label}
    </Chip>
  );
}
