'use client';

import { useCallback } from 'react';
import { routing, type AppLocale } from '@/i18n/routing';

const STORAGE_KEY = 'sicaps_locale';
const COOKIE_NAME = 'NEXT_LOCALE';

/**
 * Persists locale preference to localStorage and NEXT_LOCALE cookie.
 * next-intl middleware reads NEXT_LOCALE automatically on subsequent visits.
 */
export function useLocaleSession() {
  const saveLocale = useCallback((locale: AppLocale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // localStorage unavailable (e.g. incognito in some browsers)
    }
    document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=31536000;SameSite=Lax`;
  }, []);

  return { saveLocale };
}

/** Read stored locale from localStorage (safe for SSR — returns null). */
export function getStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && routing.locales.includes(stored as AppLocale)) {
      return stored as AppLocale;
    }
  } catch {
    // ignore
  }
  return null;
}
