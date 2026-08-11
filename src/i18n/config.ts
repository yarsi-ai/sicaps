import { CONFIG } from '@/lib/config';

export const locales = CONFIG.i18n.SUPPORTED_LOCALES;
export const defaultLocale = CONFIG.i18n.DEFAULT_LOCALE;

export type Locale = (typeof locales)[number];
