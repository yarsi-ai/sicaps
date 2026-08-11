'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Capi from '@/components/Capi';
import Button from '@/components/ui/Button';
import HeaderBar from '@/components/ui/HeaderBar';
import RiskChip from '@/components/ui/RiskChip';
import {
  AutoExpireIcon,
  CloudSaveIcon,
  HistoryClockIcon,
  LockIcon,
  TrashIcon,
  XIcon,
} from '@/components/icons';
import { useToast } from '@/components/ui/Toast';
import { useHistory } from '@/hooks/useHistory';
import { useLongPress } from '@/hooks/useLongPress';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { cx } from '@/lib/cx';
import type { HistoryEntry } from '@/types/screening-ui';

function HistoryCard({ entry, onDelete }: { entry: HistoryEntry; onDelete: (id: string) => void }) {
  const t = useTranslations('riwayat');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const justSelected = useRef(false);

  const longPress = useLongPress({
    delay: 420,
    onLongPress: () => {
      setSelected(true);
      justSelected.current = true;
    },
  });
  const riskLabelKey = { tinggi: 'riskTinggi', sedang: 'riskSedang', rendah: 'riskRendah' }[
    entry.level
  ];

  // Tap anywhere outside the card to deselect
  useEffect(() => {
    if (!selected) return;
    function handleClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setSelected(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [selected]);

  const handleClick = () => {
    // Skip the click that fires immediately after long-press
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    if (selected) setSelected(false);
  };

  return (
    <div
      ref={cardRef}
      {...longPress}
      onClick={handleClick}
      className={cx(
        'relative rounded-card border-2 bg-surface-card px-4 py-3.5 transition-transform select-none',
        selected ? 'scale-[0.99] border-border-strong shadow-sticker-md' : 'border-border-subtle',
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
          <HistoryClockIcon />
          {formatRelativeTime(entry.createdAt, locale)}
        </span>
        <span
          className={cx(
            'rounded-pill px-2.5 py-1 text-[11px] font-extrabold',
            entry.mode === 'ai'
              ? 'bg-hist-ai-bg text-hist-ai-text'
              : 'bg-hist-q-bg text-hist-q-text',
          )}
        >
          {entry.mode === 'ai' ? t('modeAI') : t('modeQuestionnaire')}
        </span>
      </div>

      {(entry.nama || entry.usia || entry.jenisKelamin) && (
        <div className="mb-2 text-[12px] text-text-body">
          {[
            entry.nama,
            entry.usia ? `${entry.usia} th` : null,
            entry.jenisKelamin === 'L'
              ? 'Laki-laki'
              : entry.jenisKelamin === 'P'
                ? 'Perempuan'
                : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2.5">
        <div className="font-display text-[26px] leading-none font-normal text-text-strong">
          {entry.score}
          <span className="text-sm text-text-faint">/12</span>
        </div>
        <RiskChip level={entry.level} label={common(riskLabelKey)} />
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={() => router.push(`/result?session=${entry.id}&token=${entry.shareToken}`)}
        >
          {t('seeResult')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => router.push(`/transcript?session=${entry.id}&token=${entry.shareToken}`)}
        >
          {t('seeChat')}
        </Button>
      </div>

      {selected && (
        <button
          onClick={() => onDelete(entry.id)}
          className="absolute top-2.5 right-3 inline-flex items-center gap-1.5 rounded-[10px] border-2 border-border-strong bg-accent-danger px-2.5 py-1.5 text-xs font-extrabold text-text-cream shadow-sticker-sm"
        >
          <TrashIcon />
          {t('delete')}
        </button>
      )}
    </div>
  );
}

export default function HistoryScreen() {
  const t = useTranslations('riwayat');
  const common = useTranslations('common');
  const router = useRouter();
  const { showToast } = useToast();
  const { entries, hydrated, removeEntry } = useHistory();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const handleDelete = (id: string) => {
    removeEntry(id);
    showToast(t('deletedToast'));
  };

  return (
    <div className="flex h-full flex-col bg-surface-alt">
      <HeaderBar title={t('title')} onBack={() => router.push('/')} backLabel={common('back')} />

      {hydrated && entries.length > 0 && (
        <>
          <div className="px-6.5 pb-0.5">
            <div className="flex items-center gap-1.5 rounded-input border-[1.5px] border-border-subtle bg-surface-app px-3 py-2.5">
              <LockIcon />
              <span className="text-[11.5px] font-bold text-text-body">{t('privacy')}</span>
            </div>
            <div className="py-1.5 text-center text-[10.5px] font-bold text-text-faint">
              {t('longPressHint')}
            </div>
          </div>

          {!nudgeDismissed && (
            <div className="mx-6.5 mt-1.5 flex items-center gap-2.5 rounded-input border-2 border-dashed border-border-dashed bg-surface-card px-2.5 py-2.5">
              <CloudSaveIcon />
              <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-text-body">
                {t('nudge')}
              </span>
              <button
                onClick={() => showToast(common('loginComingSoon'))}
                className="flex-none rounded-pill border-2 border-border-strong bg-brand-primary px-3.5 py-1.5 text-xs font-extrabold text-text-cream shadow-sticker-sm"
              >
                {t('nudgeCta')}
              </button>
              <button
                onClick={() => setNudgeDismissed(true)}
                aria-label={common('notNow')}
                className="flex h-[22px] w-[22px] flex-none items-center justify-center border-none bg-transparent"
              >
                <XIcon />
              </button>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-2.5 overflow-auto px-6.5 pt-2 pb-4.5">
            {entries.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} onDelete={handleDelete} />
            ))}
            <div className="flex items-center justify-center gap-1.5 py-1 text-center text-[10.5px] font-bold text-text-faint">
              <AutoExpireIcon />
              {t('autoExpire')}
            </div>
          </div>
        </>
      )}

      {hydrated && entries.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-9 py-5 text-center">
          <div className="mb-5 opacity-85">
            <Capi variant="empty" />
          </div>
          <h2 className="mb-2 font-display text-[19px] font-normal text-text-strong">
            {t('emptyTitle')}
          </h2>
          <p className="mb-5.5 max-w-[260px] text-[13.5px] leading-relaxed text-text-body">
            {t('emptyBody')}
          </p>
          <Button variant="primary" size="md" onClick={() => router.push('/demographics')}>
            {t('emptyCta')}
          </Button>
        </div>
      )}
    </div>
  );
}
