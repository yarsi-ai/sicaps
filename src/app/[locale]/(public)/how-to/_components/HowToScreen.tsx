'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import HeaderBar from '@/components/ui/HeaderBar';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import Card from '@/components/ui/Card';

const STEPS = [
  {
    bg: 'bg-brand-primary',
    color: 'text-text-cream',
    titleKey: 'step1Title',
    descKey: 'step1Desc',
  },
  { bg: 'bg-accent-amber', color: 'text-[#4A3208]', titleKey: 'step2Title', descKey: 'step2Desc' },
  {
    bg: 'bg-brand-secondary',
    color: 'text-text-cream',
    titleKey: 'step3Title',
    descKey: 'step3Desc',
  },
] as const;

export default function HowToScreen() {
  const t = useTranslations('cara');
  const common = useTranslations('common');
  const router = useRouter();

  return (
    <div className="flex h-full flex-col bg-surface-alt">
      <HeaderBar
        title={t('title')}
        onBack={() => router.push('/')}
        backLabel={common('back')}
        rightSlot={<LanguageSwitcher />}
      />

      <div className="flex-1 overflow-auto px-6.5 pt-1.5 pb-5.5">
        <div className="flex flex-col gap-3.5">
          {STEPS.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3.5">
              <div
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-input border-2 border-border-strong font-display shadow-sticker-sm ${step.bg} ${step.color}`}
              >
                {idx + 1}
              </div>
              <div>
                <div className="text-[14.5px] font-extrabold text-text-strong">
                  {t(step.titleKey)}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-text-body">{t(step.descKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <Card variant="dashed" className="mt-5">
          <div className="mb-1.5 text-[13px] font-extrabold text-text-strong">{t('noteTitle')}</div>
          <p className="m-0 text-[12.5px] leading-relaxed text-text-body">{t('noteDesc')}</p>
        </Card>
      </div>
    </div>
  );
}
