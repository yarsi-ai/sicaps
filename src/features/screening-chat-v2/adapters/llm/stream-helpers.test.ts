import { describe, it, expect } from 'vitest';

import type { SSEEvent } from '../../domain/types';

import { formatSSE, createSSEStream, createTokenStream } from './stream-helpers';

// --- Helper: collect all chunks from a ReadableStream ---
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let done = false;

  while (!done) {
    const read = await reader.read();
    done = read.done;
    if (read.value) {
      result += decoder.decode(read.value, { stream: true });
    }
  }
  return result;
}

// --- Helper: create async iterable from array ---
async function* asyncFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

// --- Helper: create async iterable that throws ---
async function* asyncThrow<T>(items: T[], errorAfter: number): AsyncIterable<T> {
  let count = 0;
  for (const item of items) {
    if (count >= errorAfter) {
      throw new Error('Stream interrupted');
    }
    yield item;
    count++;
  }
}

describe('formatSSE', () => {
  it('formats a token event correctly', () => {
    const event: SSEEvent = { type: 'token', data: 'hello' };
    const result = formatSSE(event);
    expect(result).toBe('event: token\ndata: "hello"\n\n');
  });

  it('formats a done event with turnCount', () => {
    const event: SSEEvent = { type: 'done', data: { turnCount: 5 } };
    const result = formatSSE(event);
    expect(result).toBe('event: done\ndata: {"turnCount":5}\n\n');
  });

  it('formats a phase event', () => {
    const event: SSEEvent = { type: 'phase', data: 'COLLECTING' };
    const result = formatSSE(event);
    expect(result).toBe('event: phase\ndata: "COLLECTING"\n\n');
  });

  it('formats an error event', () => {
    const event: SSEEvent = {
      type: 'error',
      data: { code: 'PROCESSING', message: 'Sedang diproses' },
    };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: error\ndata: {"code":"PROCESSING","message":"Sedang diproses"}\n\n',
    );
  });

  it('formats a quick_replies event with array data', () => {
    const event: SSEEvent = {
      type: 'quick_replies',
      data: [
        { token: 'lihat_hasil', label: 'Lihat Hasil' },
        { token: 'tanya_dulu', label: 'Tanya Dulu' },
      ],
    };
    const result = formatSSE(event);
    expect(result).toContain('event: quick_replies\n');
    expect(result).toContain('"token":"lihat_hasil"');
    expect(result).toContain('"label":"Lihat Hasil"');
    expect(result.endsWith('\n\n')).toBe(true);
  });

  it('formats a result event', () => {
    const event: SSEEvent = {
      type: 'result',
      data: { revision: 1, riskLevel: 'HIGH', totalScore: 9 },
    };
    const result = formatSSE(event);
    expect(result).toBe(
      'event: result\ndata: {"revision":1,"riskLevel":"HIGH","totalScore":9}\n\n',
    );
  });

  it('formats an extraction event', () => {
    const event: SSEEvent = {
      type: 'extraction',
      data: { dimensiTerisi: ['intensitas'], dimensiBelum: ['waktu', 'kontak'] },
    };
    const result = formatSSE(event);
    expect(result).toContain('event: extraction\n');
    expect(result).toContain('"dimensiTerisi":["intensitas"]');
    expect(result.endsWith('\n\n')).toBe(true);
  });
});

describe('createSSEStream', () => {
  it('streams multiple SSE events in order', async () => {
    const events: SSEEvent[] = [
      { type: 'phase', data: 'COLLECTING' },
      { type: 'token', data: 'Halo' },
      { type: 'token', data: ' selamat' },
      { type: 'done', data: { turnCount: 1 } },
    ];

    const stream = createSSEStream(asyncFrom(events));
    const output = await collectStream(stream);

    expect(output).toContain('event: phase\ndata: "COLLECTING"\n\n');
    expect(output).toContain('event: token\ndata: "Halo"\n\n');
    expect(output).toContain('event: token\ndata: " selamat"\n\n');
    expect(output).toContain('event: done\ndata: {"turnCount":1}\n\n');
  });

  it('handles empty event iterable', async () => {
    const stream = createSSEStream(asyncFrom([]));
    const output = await collectStream(stream);
    expect(output).toBe('');
  });

  it('propagates errors from the async iterable', async () => {
    const failing = asyncThrow<SSEEvent>([{ type: 'token', data: 'ok' }], 0);

    const stream = createSSEStream(failing);
    const reader = stream.getReader();

    await expect(reader.read()).rejects.toThrow('Stream interrupted');
  });
});

describe('createTokenStream', () => {
  it('wraps tokens as SSE token events and appends done', async () => {
    const tokens = ['Halo', ', ', 'apa kabar?'];
    const stream = createTokenStream(asyncFrom(tokens), { turnCount: 3 });
    const output = await collectStream(stream);

    expect(output).toContain('event: token\ndata: "Halo"\n\n');
    expect(output).toContain('event: token\ndata: ", "\n\n');
    expect(output).toContain('event: token\ndata: "apa kabar?"\n\n');
    expect(output).toContain('event: done\ndata: {"turnCount":3}\n\n');
  });

  it('emits done event with correct turnCount', async () => {
    const stream = createTokenStream(asyncFrom(['x']), { turnCount: 12 });
    const output = await collectStream(stream);
    expect(output).toContain('"turnCount":12');
  });

  it('emits error event on stream failure instead of throwing', async () => {
    // yields "first" then throws on next iteration check
    // Actually we need to throw DURING iteration
    async function* throwAfterOne(): AsyncIterable<string> {
      yield 'first';
      throw new Error('LLM connection lost');
    }

    const stream = createTokenStream(throwAfterOne(), { turnCount: 2 });
    const output = await collectStream(stream);

    // Should contain the first token
    expect(output).toContain('event: token\ndata: "first"\n\n');
    // Should contain error event instead of throwing
    expect(output).toContain('event: error\n');
    expect(output).toContain('"code":"STREAM_ERROR"');
    expect(output).toContain('"message":"Streaming gagal"');
    // Should NOT contain a done event
    expect(output).not.toContain('event: done\n');
  });

  it('handles empty token stream (done event only)', async () => {
    const stream = createTokenStream(asyncFrom([]), { turnCount: 0 });
    const output = await collectStream(stream);

    expect(output).toBe('event: done\ndata: {"turnCount":0}\n\n');
    expect(output).not.toContain('event: token\n');
  });
});
