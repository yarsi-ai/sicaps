import { useTranslations } from 'next-intl';

const WAVE_COLORS = [
  'var(--color-accent-amber)',
  'var(--color-brand-primary)',
  'var(--color-brand-secondary)',
  'var(--color-accent-danger)',
  'var(--color-brand-primary)',
  'var(--color-accent-amber)',
  'var(--color-brand-secondary)',
];
const WAVE_DELAYS = [0, 0.1, 0.2, 0.3, 0.15, 0.25, 0.35];

export default function VoiceOverlay() {
  const t = useTranslations('chat');
  return (
    <div
      className="mx-3.5 mb-2 flex flex-col items-center gap-2.5 rounded-[22px] border-2 border-border-strong bg-surface-card p-3.5 shadow-sticker-md"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-display text-[13px] font-normal text-text-strong">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-danger" />
        {t('listening')}
      </div>
      <div className="flex h-7 items-center gap-[3px]">
        {WAVE_COLORS.map((color, idx) => (
          <span
            key={idx}
            className="animate-sc-wave w-1 rounded-sm"
            style={{
              height: 28,
              background: color,
              transformOrigin: 'center',
              animationDelay: `${WAVE_DELAYS[idx]}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
