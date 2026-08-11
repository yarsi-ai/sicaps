'use client';

import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_TIMEOUT_MS = 35_000;

/** Parsed SSE event with optional event name */
export interface SSEParsedEvent<TData = unknown> {
  event: string;
  data: TData;
}

interface UseSSEOptions<TEvent> {
  onEvent: (event: TEvent) => void;
  onError?: (error: Error) => void;
  timeoutMs?: number;
}

/**
 * POSTs a JSON body and reads the response body as a stream of
 * named SSE events (`event: <name>\ndata: <json>\n\n`).
 * Native EventSource only supports GET, so streaming a POST needs a manual fetch + reader.
 * Aborts (and reports a timeout error) if the stream stalls past `timeoutMs`.
 */
export function useSSE<TEvent>({
  onEvent,
  onError,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: UseSSEOptions<TEvent>) {
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (url: string, body: unknown) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            let eventName = 'message';
            let dataStr: string | null = null;

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              onEvent({ event: eventName, data: parsed } as TEvent);
            } catch {
              /* ignore a malformed chunk rather than tearing down the stream */
            }
          }
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        onError?.(isAbort ? new Error('timeout') : (err as Error));
      } finally {
        clearTimeout(timeout);
      }
    },
    [onEvent, onError, timeoutMs],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { send, cancel };
}
