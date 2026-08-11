'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Capi from '@/components/Capi';
import Button from '@/components/ui/Button';
import AppFooter from '@/components/ui/AppFooter';
import AppHeader from '@/components/ui/AppHeader';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import SparkleDecoration from '@/components/ui/SparkleDecoration';
import { ClockIcon, HeartIcon, LoginIcon } from '@/components/icons';
import { useToast } from '@/components/ui/Toast';
import { useHistory } from '@/hooks/useHistory';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useScreening } from './ScreeningProvider';

export default function LandingScreen() {
  const t = useTranslations('landing');
  const common = useTranslations('common');
  const router = useRouter();
  const { showToast } = useToast();
  const { entries, hydrated } = useHistory();
  const { activeSession, hydrated: sessionHydrated, clear: clearSession } = useActiveSession();
  const { setSession, reset } = useScreening();
  const hasHistory = hydrated && entries.length > 0;
  const hasActiveSession = sessionHydrated && activeSession !== null;
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const handleStartScreening = () => {
    if (hasActiveSession) {
      setShowResumePrompt(true);
    } else {
      router.push('/demographics');
    }
  };

  const handleResume = () => {
    if (!activeSession) return;
    setSession(activeSession.sessionId, activeSession.sessionId, 'ai');
    router.push('/chat');
  };

  const handleNewSession = () => {
    clearSession();
    reset(); // Clear in-memory session state
    setShowResumePrompt(false);
    router.push('/demographics');
  };

  return (
    <div className="flex h-full flex-col bg-surface-alt">
      <AppHeader
        left={
          <div className="flex items-center gap-2.5">
            <Capi variant="logo" />
            <span className="font-display text-xl font-semibold text-text-strong">
              {common('appName')}
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => showToast(common('loginComingSoon'))}
              className="flex items-center gap-1.5 rounded-pill border-2 border-border-strong bg-surface-card px-3 py-1.5 text-xs font-extrabold text-text-strong shadow-sticker-sm"
            >
              <LoginIcon />
              {common('login')}
            </button>
            <LanguageSwitcher />
          </div>
        }
      />

      <div className="flex flex-1 flex-col items-center overflow-auto px-6.5 pt-5 text-center">
        <div className="relative my-3 mb-0.5">
          <SparkleDecoration top={-4} left={-34} size={20} color="var(--color-accent-amber)" />
          <SparkleDecoration
            top={38}
            right={-40}
            size={14}
            color="var(--color-brand-primary)"
            delay={0.5}
          />
          <SparkleDecoration
            bottom={-2}
            left={-26}
            size={12}
            color="var(--color-brand-secondary)"
            delay={1}
          />
          <Capi variant="hero" />
        </div>

        <div
          className="my-3.5 inline-flex items-center gap-1.5 rounded-pill border-2 bg-accent-amber px-3.5 py-1.5 text-[11.5px] font-extrabold text-text-strong"
          style={{
            transform: 'rotate(-2deg)',
            borderColor: 'color-mix(in srgb, var(--color-accent-amber) 70%, black)',
            boxShadow: '0 2px 0 color-mix(in srgb, var(--color-accent-amber) 70%, black)',
          }}
        >
          {t('badge')}
        </div>

        <h1 className="mb-2.5 font-display text-[29px] leading-[1.14] font-semibold text-text-strong">
          {t('title')}
        </h1>
        <p className="mb-4.5 max-w-[280px] text-[14.5px] leading-relaxed text-text-body">
          {t('subtitle')}
        </p>

        <div className="mb-3 flex items-center gap-2.5 rounded-card border-2 border-dashed border-border-dashed bg-surface-card px-3.5 py-3 text-left">
          <HeartIcon />
          <p className="m-0 text-xs leading-relaxed text-text-body">
            <strong className="text-text-strong">{t('disclaimerStrong')}</strong>{' '}
            {t('disclaimerRest')}
          </p>
        </div>
      </div>

      {/* Resume session prompt — shown as overlay when user clicks Mulai Screening */}
      {hasActiveSession && showResumePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-sm animate-[slideUp_0.2s_ease-out] rounded-card border-2 border-border-subtle bg-surface-card px-5 py-5 shadow-lg">
            <p className="m-0 mb-1.5 text-[14px] font-extrabold text-text-strong">
              {t('resumeTitle')}
            </p>
            <p className="m-0 mb-4 text-[13px] leading-relaxed text-text-body">{t('resumeBody')}</p>
            <div className="flex gap-2.5">
              <Button variant="primary" size="md" className="flex-1" onClick={handleResume}>
                {t('resumeContinue')}
              </Button>
              <Button variant="outlined" size="md" className="flex-1" onClick={handleNewSession}>
                {t('resumeNew')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AppFooter gradient gradientColor="var(--color-surface-alt)">
        <Button variant="primary" size="lg" fullWidth onClick={handleStartScreening}>
          {t('cta')}
        </Button>
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => router.push('/how-to')}
          >
            {t('how')}
          </Button>
          {hasHistory && (
            <Button
              variant="secondary"
              size="sm"
              className="flex flex-1 items-center justify-center gap-1.5"
              onClick={() => router.push('/history')}
            >
              <ClockIcon size={14} />
              {t('history')}
            </Button>
          )}
        </div>
      </AppFooter>
    </div>
  );
}
