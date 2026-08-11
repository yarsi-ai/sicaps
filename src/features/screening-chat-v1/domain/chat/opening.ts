import type { Theme } from '../types';
import type { SupportedLocale } from '../config';

/**
 * Static opening message templates keyed by `${theme}-${locale}`.
 * No LLM invocation — returns instantly.
 */
const OPENING_TEMPLATES: Record<`${Theme}-${SupportedLocale}`, string> = {
  'playful-id':
    'Halo! 👋 Aku di sini buat bantu kamu cek keluhan kulit. Ceritain aja ya, kulitmu lagi kenapa? Gatal, bentol, atau ada yang bikin nggak nyaman? 😊',
  'playful-en':
    "Hey there! 👋 I'm here to help you check your skin concerns. Tell me what's going on — any itching, bumps, or discomfort? 😊",
  'hybrid-id':
    'Halo, Saya asisten skrining kesehatan kulit. Silakan ceritakan keluhan kulit yang Anda rasakan saat ini — misalnya gatal, ruam, atau gejala lainnya. 🩺',
  'hybrid-en':
    'Hello, I am a skin health screening assistant. Please describe any skin concerns you are currently experiencing — such as itching, rashes, or other symptoms.',
};

/**
 * Returns the static opening message for the given theme and locale combination.
 * Pure function — no I/O, no LLM call.
 */
export function getOpeningMessage(theme: Theme, locale: SupportedLocale): string {
  const key = `${theme}-${locale}` as `${Theme}-${SupportedLocale}`;
  return OPENING_TEMPLATES[key];
}
