import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encodeSSE, createReplyDetector } from './stream-helpers';
import type { SSEEvent, DonePayload, ErrorPayload } from './stream-helpers';

describe('encodeSSE', () => {
  it('encodes a token event in text/event-stream format', () => {
    const event: SSEEvent = { event: 'token', data: { content: 'Hello' } };
    const result = encodeSSE(event);
    expect(result).toBe('event: token\ndata: {"content":"Hello"}\n\n');
  });

  it('encodes a done event with metadata', () => {
    const payload: DonePayload = {
      categoriesCovered: ['intensitas', 'waktu'],
      isComplete: false,
      mode: 'ai',
    };
    const event: SSEEvent = { event: 'done', data: payload };
    const result = encodeSSE(event);
    expect(result).toBe(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  it('encodes a done event with result', () => {
    const payload: DonePayload = {
      categoriesCovered: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
      isComplete: true,
      mode: 'ai',
      result: {
        totalScore: 8,
        riskLevel: 'HIGH',
        scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 2, kontak: 1, lesi: 1, faktor_risiko: 1 },
        conclusion: 'High risk detected.',
        perceptionResponse: null,
        recommendation: 'Visit a doctor.',
        personalizedSuggestion: null,
      },
    };
    const event: SSEEvent = { event: 'done', data: payload };
    const result = encodeSSE(event);
    expect(result).toContain('event: done\n');
    expect(result).toContain(`data: ${JSON.stringify(payload)}\n\n`);
  });

  it('encodes an error event', () => {
    const payload: ErrorPayload = {
      code: 'LLM_UNAVAILABLE',
      message: 'Service temporarily unavailable',
      retryable: true,
    };
    const event: SSEEvent = { event: 'error', data: payload };
    const result = encodeSSE(event);
    expect(result).toBe(`event: error\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  it('handles special characters in token content', () => {
    const event: SSEEvent = { event: 'token', data: { content: 'line1\nline2' } };
    const result = encodeSSE(event);
    // JSON.stringify will escape the newline as \n in the JSON string
    expect(result).toBe('event: token\ndata: {"content":"line1\\nline2"}\n\n');
  });

  it('handles empty string content', () => {
    const event: SSEEvent = { event: 'token', data: { content: '' } };
    const result = encodeSSE(event);
    expect(result).toBe('event: token\ndata: {"content":""}\n\n');
  });
});

describe('createReplyDetector', () => {
  it('returns forwardable content from the reply field', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"Hello world","extraction":{}}';
    const { forwardable, buffered } = detector.feed(json);
    expect(forwardable).toBe('Hello world');
    expect(buffered).toBe('{"reply":"","extraction":{}}');
  });

  it('handles token-by-token streaming', () => {
    const detector = createReplyDetector();
    const chunks = ['{"re', 'ply":', '"Hel', 'lo w', 'orld"', ',"extra', 'ction":{}}'];

    let allForwardable = '';
    for (const chunk of chunks) {
      const { forwardable } = detector.feed(chunk);
      allForwardable += forwardable;
    }

    expect(allForwardable).toBe('Hello world');
    expect(detector.isInsideReply()).toBe(false);
  });

  it('handles character-by-character streaming', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"ABC","other":"value"}';

    let allForwardable = '';
    for (const ch of json) {
      const { forwardable } = detector.feed(ch);
      allForwardable += forwardable;
    }

    expect(allForwardable).toBe('ABC');
  });

  it('reports isInsideReply correctly during streaming', () => {
    const detector = createReplyDetector();

    detector.feed('{"reply":"');
    expect(detector.isInsideReply()).toBe(true);

    detector.feed('hello');
    expect(detector.isInsideReply()).toBe(true);

    detector.feed('"');
    expect(detector.isInsideReply()).toBe(false);
  });

  it('handles escaped quotes inside reply value', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"say \\"hello\\"","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('say \\"hello\\"');
  });

  it('handles escaped backslash at end of reply', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"path\\\\","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('path\\\\');
  });

  it('handles newlines and special chars in reply', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"line1\\nline2\\ttab","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('line1\\nline2\\ttab');
  });

  it('buffers everything if reply key is not present', () => {
    const detector = createReplyDetector();
    const json = '{"extraction":{"intensitas":[]},"other":"value"}';
    const { forwardable, buffered } = detector.feed(json);
    expect(forwardable).toBe('');
    expect(buffered).toBe(json);
    expect(detector.isInsideReply()).toBe(false);
  });

  it('does not match reply key inside nested objects', () => {
    const detector = createReplyDetector();
    // The "reply" key inside a nested object should NOT trigger forwarding
    const json = '{"nested":{"reply":"not this"},"reply":"this one","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('this one');
  });

  it('handles whitespace around colon after reply key', () => {
    const detector = createReplyDetector();
    const json = '{"reply" : "spaced","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('spaced');
  });

  it('handles reply as the only field', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"solo"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('solo');
  });

  it('handles empty reply string', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('');
  });

  it('handles unicode characters in reply', () => {
    const detector = createReplyDetector();
    const json = '{"reply":"Halo! Apa kabar? 😊","other":"x"}';
    const { forwardable } = detector.feed(json);
    expect(forwardable).toBe('Halo! Apa kabar? 😊');
  });

  it('handles a realistic LLM response', () => {
    const detector = createReplyDetector();
    const json = JSON.stringify({
      reply: 'Halo! Saya SICAPS, asisten skrining skabies.',
      extraction: {
        intensitas: [],
        waktu: [],
        lokasi_tubuh: [],
        kontak: [],
        lesi: [],
        faktor_risiko: [],
      },
      categories_covered: [],
      next_category: 'intensitas',
      should_follow_up: false,
    });

    // Simulate chunked delivery
    const chunkSize = 5;
    let allForwardable = '';
    for (let i = 0; i < json.length; i += chunkSize) {
      const chunk = json.slice(i, i + chunkSize);
      const { forwardable } = detector.feed(chunk);
      allForwardable += forwardable;
    }

    expect(allForwardable).toBe('Halo! Saya SICAPS, asisten skrining skabies.');
  });
});

/**
 * Property-based tests for SSE stream encoding.
 *
 * **Validates: Requirements 2.2, 2.3, 2.4**
 */
describe('encodeSSE property tests', () => {
  /** Parse an SSE-encoded string back into event type and data payload */
  function parseSSE(encoded: string): { eventType: string; data: unknown } | null {
    const lines = encoded.split('\n');
    let eventType = '';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice('data: '.length);
      }
    }

    if (!eventType || !dataLine) return null;
    return { eventType, data: JSON.parse(dataLine) };
  }

  /** Arbitrary for a token SSEEvent */
  const tokenEventArb: fc.Arbitrary<SSEEvent> = fc.record({
    event: fc.constant('token' as const),
    data: fc.record({
      content: fc.string({ minLength: 0, maxLength: 200 }),
    }),
  });

  /** Arbitrary for a done SSEEvent */
  const doneEventArb: fc.Arbitrary<SSEEvent> = fc.record({
    event: fc.constant('done' as const),
    data: fc.record({
      categoriesCovered: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
        minLength: 0,
        maxLength: 6,
      }),
      isComplete: fc.boolean(),
      mode: fc.constantFrom('ai' as const, 'questionnaire' as const),
    }),
  });

  /** Arbitrary for an error SSEEvent */
  const errorEventArb: fc.Arbitrary<SSEEvent> = fc.record({
    event: fc.constant('error' as const),
    data: fc.record({
      code: fc.string({ minLength: 1, maxLength: 50 }),
      message: fc.string({ minLength: 1, maxLength: 200 }),
      retryable: fc.boolean(),
    }),
  });

  /** Arbitrary for any valid SSEEvent */
  const sseEventArb: fc.Arbitrary<SSEEvent> = fc.oneof(tokenEventArb, doneEventArb, errorEventArb);

  it('Property 7: SSE encode/decode round-trip recovers event type and data', () => {
    fc.assert(
      fc.property(sseEventArb, (event) => {
        const encoded = encodeSSE(event);

        // Verify wire format structure: ends with double newline
        expect(encoded.endsWith('\n\n')).toBe(true);

        // Parse back
        const parsed = parseSSE(encoded);
        expect(parsed).not.toBeNull();

        // Event type round-trips
        expect(parsed!.eventType).toBe(event.event);

        // Data payload round-trips (deep equality)
        expect(parsed!.data).toEqual(event.data);
      }),
      { numRuns: 100 },
    );
  });
});
