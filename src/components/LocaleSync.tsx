'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { routing, type AppLocale } from '@/i18n/routing';

const STORAGE_KEY = 'sicaps_locale';
const COOKIE_NAME = 'NEXT_LOCALE';

/**
 * Persists the current locale to localStorage + NEXT_LOCALE cookie on mount.
 * This ensures that on subsequent visits, next-intl middleware serves
 * the last-used locale.
 *
 * NOTE: This does NOT redirect on mismatch. Redirecting is only done
 * by the middleware reading the NEXT_LOCALE cookie. The LanguageSwitcher
 * is the only component that actively changes the stored preference.
 */
export default function LocaleSync() {
  const params = useParams();
  const currentLocale = (params?.locale as AppLocale) ?? routing.defaultLocale;

  useEffect(() => {
    // Always sync current URL locale to storage so middleware picks it up next time
    try {
      localStorage.setItem(STORAGE_KEY, currentLocale);
    } catch {
      // ignore
    }
    document.cookie = `${COOKIE_NAME}=${currentLocale};path=/;max-age=31536000;SameSite=Lax`;
  }, [currentLocale]);

  return null;
}
