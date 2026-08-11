import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { successResponse, errorResponse } from './response';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIso8601(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

// Feature: screening-api, Property 5: Error envelope structure consistency
describe('Property 5: Error envelope structure consistency', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * For any error code and message string, calling errorResponse(code, message)
   * SHALL produce an object with exactly the shape
   * { data: null, error: { code, message, details: null }, meta: { timestamp, requestId } }
   * where timestamp is a valid ISO 8601 string and requestId is a valid UUID v4.
   */
  it('produces correct error envelope shape for any code and message', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);

        // data is null
        expect(response.data).toBeNull();

        // error has correct shape
        expect(response.error).not.toBeNull();
        expect(response.error!.code).toBe(code);
        expect(response.error!.message).toBe(message);
        expect(response.error!.details).toBeNull();

        // meta.timestamp is valid ISO 8601
        expect(isValidIso8601(response.meta.timestamp)).toBe(true);

        // meta.requestId is valid UUID v4
        expect(response.meta.requestId).toMatch(UUID_V4_REGEX);
      }),
      { numRuns: 100 },
    );
  });

  it('has exactly three top-level keys: data, error, meta', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);
        expect(Object.keys(response).sort()).toEqual(['data', 'error', 'meta']);
      }),
      { numRuns: 100 },
    );
  });

  it('error object has exactly three keys: code, message, details', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);
        expect(Object.keys(response.error!).sort()).toEqual(['code', 'details', 'message']);
      }),
      { numRuns: 100 },
    );
  });

  it('meta object has exactly two keys: requestId, timestamp', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (code, message) => {
        const response = errorResponse(code, message);
        expect(Object.keys(response.meta).sort()).toEqual(['requestId', 'timestamp']);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: screening-api, Property 6: Success envelope structure consistency
describe('Property 6: Success envelope structure consistency', () => {
  /**
   * **Validates: Requirements 6.1, 6.3, 6.4**
   *
   * For any data value T, calling successResponse(T) SHALL produce an object
   * with exactly the shape { data: T, error: null, meta: { timestamp, requestId } }
   * where timestamp is a valid ISO 8601 string and requestId is a valid UUID v4.
   */
  const arbitraryData = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double({ noNaN: true }),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.jsonValue()),
    fc.dictionary(fc.string(), fc.jsonValue()),
  );

  it('produces correct success envelope shape for any data value', () => {
    fc.assert(
      fc.property(arbitraryData, (data) => {
        const response = successResponse(data);

        // data matches input
        expect(response.data).toEqual(data);

        // error is null
        expect(response.error).toBeNull();

        // meta.timestamp is valid ISO 8601
        expect(isValidIso8601(response.meta.timestamp)).toBe(true);

        // meta.requestId is valid UUID v4
        expect(response.meta.requestId).toMatch(UUID_V4_REGEX);
      }),
      { numRuns: 100 },
    );
  });

  it('has exactly three top-level keys: data, error, meta', () => {
    fc.assert(
      fc.property(arbitraryData, (data) => {
        const response = successResponse(data);
        expect(Object.keys(response).sort()).toEqual(['data', 'error', 'meta']);
      }),
      { numRuns: 100 },
    );
  });

  it('meta object has exactly two keys: requestId, timestamp', () => {
    fc.assert(
      fc.property(arbitraryData, (data) => {
        const response = successResponse(data);
        expect(Object.keys(response.meta).sort()).toEqual(['requestId', 'timestamp']);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves data identity for all types', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const response = successResponse(data);
        expect(response.data).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });
});
