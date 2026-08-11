'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

interface OfflineBannerProps {
  onRetry: () => void;
}

/** A slim banner shown when the browser reports no network connection. */
export default function OfflineBanner({ onRetry }: OfflineBannerProps) {
  const t = useTranslations('chat');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // navigator.onLine is a browser-only API unavailable during SSR, so the
    // initial read has to happen post-mount rather than in useState's
    // initializer (which would mismatch the server-rendered markup).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="mx-3.5 mt-2.5 flex items-center gap-2.5 rounded-card border-2 border-dashed border-border-dashed bg-surface-card px-3.5 py-2.5">
      <span className="flex-1 text-[12px] leading-snug text-text-body">
        <strong className="font-extrabold text-text-strong">{t('offlineTitle')}</strong>{' '}
        {t('offlineBody')}
      </span>
      <Button variant="outlined" size="sm" onClick={onRetry}>
        {t('offlineRetry')}
      </Button>
    </div>
  );
}
