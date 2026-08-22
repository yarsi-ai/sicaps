/**
 * Guard for the client exposure of SCREENING_CHAT_VERSION.
 *
 * `lib/config.ts` reads `process.env.SCREENING_CHAT_VERSION` and is imported by
 * client components (ScreeningProvider, ChatScreen, ResultScreen). Next.js only
 * inlines an environment variable into the browser bundle when it is either
 * `NEXT_PUBLIC_*` prefixed or listed in `next.config.ts`'s `env` block.
 *
 * When that wiring was missing, the browser saw `undefined`, `lib/config.ts`
 * fell back to 'v1', and the entire visual detection flow disappeared on a v2
 * deployment — the chat finished with "Lihat Hasil" already enabled and no
 * photo step at all. This test pins the wiring so that cannot recur silently.
 */

import { describe, it, expect } from 'vitest';

import nextConfig from '../../next.config';

describe('next.config env exposure', () => {
  it('exposes SCREENING_CHAT_VERSION to the client bundle', () => {
    expect(nextConfig.env).toBeDefined();
    expect(nextConfig.env).toHaveProperty('SCREENING_CHAT_VERSION');
  });

  it('exposes VISUAL_DETECTION_GATE_AT_START to the client bundle', () => {
    // Read by ChatScreen and useChat, both client modules, so it needs the same
    // treatment. Retire this alongside the flag itself.
    expect(nextConfig.env).toHaveProperty('VISUAL_DETECTION_GATE_AT_START');
    expect(nextConfig.env?.VISUAL_DETECTION_GATE_AT_START).toBeTypeOf('string');
  });

  it('mirrors the process value so .env stays the single source of truth', () => {
    expect(nextConfig.env?.SCREENING_CHAT_VERSION).toBe(process.env.SCREENING_CHAT_VERSION ?? 'v1');
  });

  it('defaults to v1 rather than undefined when the variable is unset', () => {
    // An undefined entry would reintroduce the original failure mode: the
    // client falling back to v1 without anything flagging it.
    expect(nextConfig.env?.SCREENING_CHAT_VERSION).toBeTypeOf('string');
  });
});
