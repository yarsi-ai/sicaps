import { vi, describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSSE, type SSEParsedEvent } from './useSSE';

/**
 * Timings are real, not faked, and deliberately tiny.
 *
 * What is under test is how the idle deadline interleaves with reads from the
 * stream. Fake timers cannot express that: advancing them from the producer runs
 * ahead of the consumer, so every chunk is already buffered by the time the hook
 * reads, and a stalled stream looks identical to a healthy one.
 */
const GAP_MS = 80;
const IDLE_BUDGET_MS = 120;

/** Sleep that rejects the way an aborted fetch does. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

/**
 * Build a Response whose body yields one chunk per read, `gapMs` apart.
 *
 * Production happens in `pull`, so a chunk is only produced when the consumer
 * asks for one, and the gaps land between reads rather than before them. The
 * signal is honoured because that is the part of fetch that matters here: an
 * abort has to surface as a rejected read, or a stalled stream is
 * indistinguishable from a healthy one.
 */
function streamingResponse(chunks: string[], gapMs = 0): (signal: AbortSignal) => Response {
  return (signal) => {
    const encoder = new TextEncoder();
    let index = 0;

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        if (gapMs > 0) await delay(gapMs, signal);
        controller.enqueue(encoder.encode(chunks[index]!));
        index += 1;
      },
    });

    return { ok: true, status: 200, body } as unknown as Response;
  };
}

/** Install a fetch stub that hands the abort signal to the response builder. */
function stubFetch(build: (signal: AbortSignal) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { signal: AbortSignal }) => build(init.signal)),
  );
}

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('useSSE', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers each named event with its parsed data', async () => {
    stubFetch(streamingResponse([sseChunk('token', 'Halo'), sseChunk('done', { turnCount: 4 })]));

    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSE<SSEParsedEvent>({ onEvent }));

    await result.current.send('/api/screening/chat', { message: 'hai' });

    expect(onEvent).toHaveBeenCalledWith({ event: 'token', data: 'Halo' });
    expect(onEvent).toHaveBeenCalledWith({ event: 'done', data: { turnCount: 4 } });
  });

  // The regression this hook had: the deadline was armed once for the whole
  // request. A turn that legitimately outran it was aborted mid-flight, and
  // because aborting the fetch does not stop the server, the reply it had
  // already saved never reached the screen — the visible transcript silently
  // fell behind the stored session.
  it('does not abort a slow turn that keeps producing output', async () => {
    stubFetch(
      streamingResponse(
        [
          sseChunk('phase', 'ASKING_PERCEPTION'),
          sseChunk('token', 'Menurut kamu...'),
          sseChunk('done', { turnCount: 3 }),
        ],
        // Each gap alone stays inside the budget; together they exceed it.
        GAP_MS,
      ),
    );

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSSE<SSEParsedEvent>({ onEvent, onError, timeoutMs: IDLE_BUDGET_MS }),
    );

    await result.current.send('/api/screening/chat', { message: 'siap' });

    expect(onError).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledTimes(3);
  });

  it('reports a timeout when the stream goes quiet for the whole budget', async () => {
    stubFetch(
      streamingResponse(
        [sseChunk('phase', 'ASKING_PERCEPTION'), sseChunk('token', 'never arrives')],
        // Every gap outlasts the budget, so the first read already stalls.
        IDLE_BUDGET_MS * 3,
      ),
    );

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSSE<SSEParsedEvent>({ onEvent, onError, timeoutMs: IDLE_BUDGET_MS }),
    );

    await result.current.send('/api/screening/chat', { message: 'siap' });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'timeout' }));
  });

  it('reports the failure when the request is rejected outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, body: null } as unknown as Response),
    );

    const onError = vi.fn();
    const { result } = renderHook(() => useSSE<SSEParsedEvent>({ onEvent: vi.fn(), onError }));

    await result.current.send('/api/screening/chat', { message: 'hai' });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Request failed with status 500' }),
    );
  });

  it('skips a malformed chunk instead of tearing down the stream', async () => {
    stubFetch(
      streamingResponse(['event: token\ndata: {not json\n\n', sseChunk('done', { turnCount: 1 })]),
    );

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useSSE<SSEParsedEvent>({ onEvent, onError }));

    await result.current.send('/api/screening/chat', { message: 'hai' });

    expect(onError).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ event: 'done', data: { turnCount: 1 } });
  });
});
