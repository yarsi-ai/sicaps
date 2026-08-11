/**
 * Feature version router — facade for screening feature version switching.
 * Uses dynamic imports for tree-shaking: only the active version is bundled.
 *
 * Requirements: 15.1, 15.2, 15.3
 */
import { SCREENING_CHAT_VERSION } from './config';
import * as v1 from '@/features/screening-chat-v1';

/**
 * Returns the active screening module (sync, v1 only).
 * For v2-aware code that needs async resolution, use `getScreeningModuleAsync`.
 */
export function getScreeningFeature() {
  if (SCREENING_CHAT_VERSION === 'v2') {
    throw new Error(
      'SCREENING_CHAT_VERSION is v2 — use getScreeningModuleAsync() for dynamic import.',
    );
  }
  return v1;
}

/**
 * Dynamically import the active screening module.
 * Uses dynamic import for v2 so that tree-shaking excludes the inactive version.
 */
export async function getScreeningModuleAsync() {
  if (SCREENING_CHAT_VERSION === 'v2') {
    return import('@/features/screening-chat-v2');
  }
  return import('@/features/screening-chat-v1');
}

export type ScreeningFeature = typeof v1;
