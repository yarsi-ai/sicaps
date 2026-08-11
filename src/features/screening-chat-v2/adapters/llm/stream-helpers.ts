/**
 * SSE streaming utilities for Screening Chat V2.
 *
 * Uses Web Streams API (ReadableStream) — standard in Next.js runtime.
 * Formats domain SSEEvent types into standard SSE wire format.
 */

import type { SSEEvent } from '../../domain/types';

/**
 * Format an SSEEvent into a standard SSE string for transmission.
 * Format: `event: {type}\ndata: {JSON}\n\n`
 */
export function formatSSE(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Create a ReadableStream that emits SSE events from an async iterable.
 * Used to construct the streaming response from chat service.
 */
export function createSSEStream(events: AsyncIterable<SSEEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(formatSSE(event)));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Create a ReadableStream from LLM token chunks that emits SSE token events.
 * Appends a 'done' event at the end. On error, emits an 'error' event
 * before closing (progressive degradation).
 */
export function createTokenStream(
  tokenIterator: AsyncIterable<string>,
  metadata: { turnCount: number },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const token of tokenIterator) {
          const event: SSEEvent = { type: 'token', data: token };
          controller.enqueue(encoder.encode(formatSSE(event)));
        }
        const doneEvent: SSEEvent = {
          type: 'done',
          data: { turnCount: metadata.turnCount },
        };
        controller.enqueue(encoder.encode(formatSSE(doneEvent)));
        controller.close();
      } catch {
        const errorEvent: SSEEvent = {
          type: 'error',
          data: { code: 'STREAM_ERROR', message: 'Streaming gagal' },
        };
        controller.enqueue(encoder.encode(formatSSE(errorEvent)));
        controller.close();
      }
    },
  });
}
