'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { useLocaleSession } from '@/hooks/useLocaleSession';
import { cx } from '@/lib/cx';

interface LanguageSwitcherProps {
  variant?: 'default' | 'light';
}

export default function LanguageSwitcher({ variant = 'default' }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const activeLocale = (params?.locale as string) ?? routing.defaultLocale;
  const [, startTransition] = useTransition();

  const { saveLocale } = useLocaleSession();

  const setLocale = (locale: AppLocale) => {
    saveLocale(locale);
    const search = searchParams.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;
    startTransition(() => {
      router.replace(fullPath, { locale });
    });
  };

  const light = variant === 'light';

  return (
    <div
      className={cx(
        'flex items-center gap-0.5 rounded-pill px-[3px] py-[2px]',
        light ? 'bg-white/[.18]' : 'border-2 border-border-strong bg-surface-app shadow-sticker-sm',
      )}
    >
      {routing.locales.map((locale) => {
        const active = activeLocale === locale;
        return (
          <button
            key={locale}
            onClick={() => setLocale(locale)}
            className={cx(
              'rounded-pill px-[11px] py-1 text-[11.5px] font-extrabold',
              active
                ? light
                  ? 'bg-text-cream text-[#3E5730]'
                  : 'bg-text-strong text-text-cream'
                : light
                  ? 'bg-transparent text-white/85'
                  : 'bg-transparent text-text-muted',
            )}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
