import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { successResponse, errorResponse } from './response';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIso8601(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && date.toISOString() === timestamp;
}

/**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */
describe('successResponse', () => {
  /**
   * Property 1: API envelope structure invariant
   * For any data value, successResponse produces an object with exactly
   * three top-level keys (data, error, meta), valid ISO 8601 timestamp,
   * and valid UUID v4 requestId.
   */
  it('has correct envelope structure for any data value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const response = successResponse(data);

        // Exactly three top-level keys
        expect(Object.keys(response).sort()).toEqual(['data', 'error', 'meta']);

        // meta contains valid timestamp and requestId
        expect(isValidIso8601(response.meta.timestamp)).toBe(true);
        expect(response.meta.requestId).toMatch(UUID_V4_REGEX);
      }),
    );
  });

  /**
   * Property 2: Success/error mutual exclusivity
   * For any data value, successResponse has data non-null and error null.
   */
  it('has data non-null and error null for any data value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const response = successResponse(data);

        expect(response.data).toEqual(data);
        expect(response.error).toBeNull();
      }),
    );
  });
});

/**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */
describe('errorResponse', () => {
  /**
   * Property 1: API envelope structure invariant
   * For any code/message, errorResponse produces an object with exactly
   * three top-level keys (data, error, meta), valid ISO 8601 timestamp,
   * and valid UUID v4 requestId.
   */
  it('has correct envelope structure for any code and message', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);

        // Exactly three top-level keys
        expect(Object.keys(response).sort()).toEqual(['data', 'error', 'meta']);

        // meta contains valid timestamp and requestId
        expect(isValidIso8601(response.meta.timestamp)).toBe(true);
        expect(response.meta.requestId).toMatch(UUID_V4_REGEX);
      }),
    );
  });

  /**
   * Property 2: Success/error mutual exclusivity
   * For any code/message, errorResponse has error non-null and data null.
   */
  it('has error non-null and data null for any code and message', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);

        expect(response.data).toBeNull();
        expect(response.error).not.toBeNull();
        expect(response.error?.code).toBe(code);
        expect(response.error?.message).toBe(message);
      }),
    );
  });
});
