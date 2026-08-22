/**
 * Tests for the pacing of the rows an image submission returns.
 *
 * An upload is not a chat turn, so nothing streams these rows in — `useChat`
 * mirrors them locally. Appending all of them at once puts two bot messages on
 * screen in the same instant, which reads as a canned system dump rather than
 * as Capi talking.
 *
 * Requirements: 1.5, 2A.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useLocale: () => 'id',
  useTranslations: () => (key: string) => key,
}));

const mockSetPhase = vi.fn();

vi.mock('../../_components/ScreeningProvider', () => ({
  useScreening: () => ({
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    shareToken: 'token-1',
    incognito: false,
    demographics: {},
    setSession: vi.fn(),
    setPhase: mockSetPhase,
  }),
}));

vi.mock('@/hooks/useSSE', () => ({
  useSSE: () => ({ send: vi.fn() }),
}));

vi.mock('@/hooks/useActiveSession', () => ({
  saveActiveSession: vi.fn(),
  clearActiveSession: vi.fn(),
}));

vi.mock('@/hooks/useHistory', () => ({
  useHistory: () => ({ addEntry: vi.fn() }),
}));

import { CONFIG } from '@/lib/config';
import { useChat } from './useChat';

const FEEDBACK = 'Fotonya udah aku terima dan berhasil dianalisis.';
const FOLLOW_UP = 'Nah menurut kamu, keluhan gatal ini seberapa berat?';

const originalFetch = global.fetch;

/** Resume with one bot row so the bootstrap settles into a known state. */
function mockResume(): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          phase: 'AWAITING_IMAGE',
          turnCount: 6,
          dimensiTerisi: {},
          dimensiBelum: [],
          messages: [
            {
              role: 'assistant',
              content: 'Sebelum lanjut, kirim satu foto ya.',
              timestamp: '2026-08-12T00:00:00.000Z',
            },
          ],
        },
        error: null,
        meta: { timestamp: '2026-08-12T00:00:00.000Z', requestId: 'req-1' },
      }),
  }) as unknown as typeof global.fetch;
}

describe('useChat appendImageTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResume();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  /**
   * Render and let the bootstrap settle on real timers, then freeze time.
   *
   * Testing Library's `waitFor` polls on real timers, so installing fake ones
   * before the hook is ready deadlocks the wait.
   */
  async function renderReadyChat({ freezeTime = false } = {}) {
    const { result, unmount } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.ready).toBe(true));
    if (freezeTime) vi.useFakeTimers();
    return { result, unmount };
  }

  it('appends the photo and the feedback immediately', async () => {
    const { result } = await renderReadyChat({ freezeTime: true });

    act(() => {
      result.current.appendImageTurn('blob:preview', FEEDBACK, FOLLOW_UP);
    });

    // The photo bubble is truly immediate (user turn, no typing indicator).
    expect(result.current.msgs.some((m) => m.kind === 'image')).toBe(true);

    // The feedback arrives after a natural typing pause so it reads as Capi
    // composing a reply rather than all content landing in one frame.
    act(() => {
      vi.advanceTimersByTime(CONFIG.typingPace.MAX_MS);
    });

    const texts = result.current.msgs.map((m) => m.text);
    expect(texts).toContain(FEEDBACK);
  });

  it('holds the follow-up back behind the typing indicator', async () => {
    const { result } = await renderReadyChat({ freezeTime: true });

    act(() => {
      result.current.appendImageTurn('blob:preview', FEEDBACK, FOLLOW_UP);
    });

    // Two bot messages landing in the same render is the thing being prevented.
    expect(result.current.msgs.map((m) => m.text)).not.toContain(FOLLOW_UP);
    expect(result.current.typing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(CONFIG.typingPace.MAX_MS);
    });

    expect(result.current.msgs.map((m) => m.text)).toContain(FOLLOW_UP);
    expect(result.current.typing).toBe(false);
  });

  it('keeps the follow-up last, matching the order the server persisted', async () => {
    const { result } = await renderReadyChat({ freezeTime: true });

    act(() => {
      result.current.appendImageTurn('blob:preview', FEEDBACK, FOLLOW_UP);
      vi.advanceTimersByTime(CONFIG.typingPace.MAX_MS);
    });

    const texts = result.current.msgs.map((m) => m.text);
    expect(texts.indexOf(FOLLOW_UP)).toBeGreaterThan(texts.indexOf(FEEDBACK));
  });

  it('never shows the typing indicator when there is no follow-up', async () => {
    const { result } = await renderReadyChat({ freezeTime: true });

    act(() => {
      result.current.appendImageTurn('blob:preview', FEEDBACK, null);
    });

    // A typing pause still precedes the feedback so it reads naturally. After
    // the pause the indicator clears and the feedback lands.
    act(() => {
      vi.advanceTimersByTime(CONFIG.typingPace.MAX_MS);
    });

    expect(result.current.typing).toBe(false);
    expect(result.current.msgs.map((m) => m.text)).toContain(FEEDBACK);
  });

  it('drops a pending follow-up when the hook unmounts', async () => {
    const { result, unmount } = await renderReadyChat({ freezeTime: true });

    act(() => {
      result.current.appendImageTurn('blob:preview', FEEDBACK, FOLLOW_UP);
    });

    unmount();

    // The santri can tap through to the result page while this is still pending;
    // the timer must not survive to fire into a dead setState.
    expect(() => vi.advanceTimersByTime(CONFIG.typingPace.MAX_MS)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
