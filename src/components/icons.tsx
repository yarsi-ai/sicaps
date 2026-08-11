interface IconProps {
  size?: number;
  color?: string;
}

export function LoginIcon({ size = 13, color = 'var(--color-text-strong)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M10 17l5-5-5-5M15 12H3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldIcon({ size = 13, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Z"
        stroke={color}
        strokeWidth="2"
      />
      <circle cx="12" cy="9" r="2.5" fill={color} />
    </svg>
  );
}

export function ClockIcon({ size = 14, color = 'var(--color-text-strong)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2" />
      <path
        d="M12 7.5V12l3 1.8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MicIcon({ size = 20, color = 'var(--color-brand-primary)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill={color} />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 22, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SendIcon({ size = 19, color = '#FFF9EC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20V5M5 12l7-7 7 7"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VoiceBarsIcon({ size = 20, color = 'var(--color-brand-primary)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="9" width="2.6" height="6" rx="1.3" fill={color} />
      <rect x="8.5" y="5" width="2.6" height="14" rx="1.3" fill={color} />
      <rect x="13" y="7" width="2.6" height="10" rx="1.3" fill={color} />
      <rect x="17.5" y="10" width="2.6" height="4" rx="1.3" fill={color} />
    </svg>
  );
}

export function IncognitoIcon({ size = 20, color = 'var(--color-text-strong)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 9.5l1.1-3.1a2 2 0 0 1 2.4-1.27l.9.24a4.5 4.5 0 0 0 2.2 0l.9-.24a2 2 0 0 1 2.4 1.27L18 9.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 11.5h17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="15" r="3" stroke={color} strokeWidth="1.8" />
      <circle cx="16" cy="15" r="3" stroke={color} strokeWidth="1.8" />
      <path d="M11 15c.6-.6 1.4-.6 2 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 14, color = '#FFF9EC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckSquareIcon({ color = '#FFF9EC' }: IconProps) {
  return <span style={{ fontSize: 11, fontWeight: 800, color, lineHeight: 1 }}>✓</span>;
}

export function CloudSaveIcon({ size = 17, color = 'var(--color-text-muted)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 6.96"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 17v-6M9.6 13.2L12 10.8l2.4 2.4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XIcon({ size = 12, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function HeartIcon({ size = 17, color = 'var(--color-brand-primary)' }: IconProps) {
  return <span style={{ fontSize: size, color, lineHeight: 1 }}>♥</span>;
}

export function SparkleGlyph({ size = 14, color = 'var(--color-accent-amber)' }: IconProps) {
  return <span style={{ fontSize: size, color, lineHeight: 1 }}>✦</span>;
}

export function StorageIcon({ size = 12, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z"
        stroke={color}
        strokeWidth="2"
      />
      <path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function HistoryClockIcon({ size = 12, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M12 7.5V12l3 1.6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ size = 14, color = 'var(--color-text-strong)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke={color} strokeWidth="2" />
      <rect x="4.5" y="10" width="15" height="9.5" rx="3" fill={color} />
    </svg>
  );
}

export function AutoExpireIcon({ size = 12, color = 'var(--color-text-faint)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
