import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * `SCREENING_CHAT_VERSION` is read by client components too — the image gate
   * in ScreeningProvider/ChatScreen and the gate check in ResultScreen all
   * branch on it. Without this block the variable is server-only, so
   * `process.env.SCREENING_CHAT_VERSION` is `undefined` in the browser bundle
   * and `lib/config.ts` silently falls back to 'v1', disabling visual detection
   * on a v2 deployment.
   *
   * Declared here rather than renaming to `NEXT_PUBLIC_*` so `.env` keeps one
   * source of truth for the flag. It is a deployment-level switch, not a
   * secret, and inlining it at build time is the intended tradeoff.
   */
  env: {
    SCREENING_CHAT_VERSION: process.env.SCREENING_CHAT_VERSION ?? 'v1',
    // Temporary testing switch — see VISUAL_DETECTION_GATE_AT_START in lib/config.ts.
    VISUAL_DETECTION_GATE_AT_START: process.env.VISUAL_DETECTION_GATE_AT_START ?? 'false',
    // Set to "false" to skip typing animation delays during testing.
    TYPING_ANIMATION: process.env.TYPING_ANIMATION ?? 'true',
  },
};

export default withNextIntl(nextConfig);
