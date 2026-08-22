import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isAllowedMimeType, isWithinSizeLimit } from './validation';
import { CONFIG } from '@/lib/config';

/**
 * Property-based tests for validation functions in the visual detection feature.
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

const MAX_FILE_SIZE = CONFIG.visualDetection.MAX_FILE_SIZE_BYTES; // 10MB = 10,485,760 bytes
const ALLOWED_MIME_TYPES = CONFIG.visualDetection.ALLOWED_MIME_TYPES;

// Feature: visual-detection, Property 1: MIME Type Validation Correctness
describe('Feature: visual-detection, Property 1: MIME Type Validation Correctness', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * For all strings, validating a file's MIME type against the allowed set SHALL
   * accept the value if and only if it is in `CONFIG.visualDetection.ALLOWED_MIME_TYPES`.
   */
  it('accepts ONLY allowed MIME types', () => {
    fc.assert(
      fc.property(fc.string(), (mimeType) => {
        const result = isAllowedMimeType(mimeType);
        const isExactlyAllowed = ALLOWED_MIME_TYPES.includes(
          mimeType as (typeof ALLOWED_MIME_TYPES)[number],
        );

        // The function should return true if and only if mimeType is in the allowed list
        expect(result).toBe(isExactlyAllowed);
      }),
      { numRuns: 100 },
    );
  });

  it('always accepts each allowed MIME type', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALLOWED_MIME_TYPES), (mimeType) => {
        expect(isAllowedMimeType(mimeType)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any string that is not exactly one of the allowed MIME types', () => {
    // Generate strings that are definitely not in the allowed list
    fc.assert(
      fc.property(
        fc
          .string()
          .filter((s) => !ALLOWED_MIME_TYPES.includes(s as (typeof ALLOWED_MIME_TYPES)[number])),
        (mimeType) => {
          expect(isAllowedMimeType(mimeType)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: visual-detection, Property 2: File Size Validation Correctness
describe('Feature: visual-detection, Property 2: File Size Validation Correctness', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For all non-negative integers representing file size in bytes, validating the file size
   * SHALL accept the value if and only if it is greater than 0 and less than or equal to
   * 10,485,760 bytes (10MB).
   */
  it('accepts file size if and only if it is > 0 AND <= 10,485,760 bytes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_FILE_SIZE * 2 }), (fileSize) => {
        const result = isWithinSizeLimit(fileSize);
        const expectedResult = fileSize > 0 && fileSize <= MAX_FILE_SIZE;

        expect(result).toBe(expectedResult);
      }),
      { numRuns: 100 },
    );
  });

  it('always accepts valid file sizes (1 to MAX_FILE_SIZE inclusive)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_FILE_SIZE }), (fileSize) => {
        expect(isWithinSizeLimit(fileSize)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('always rejects zero file size', () => {
    expect(isWithinSizeLimit(0)).toBe(false);
  });

  it('always rejects negative file sizes', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: -1 }), (fileSize) => {
        expect(isWithinSizeLimit(fileSize)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('always rejects file sizes exceeding MAX_FILE_SIZE', () => {
    fc.assert(
      fc.property(fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE * 10 }), (fileSize) => {
        expect(isWithinSizeLimit(fileSize)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('correctly handles boundary values at MAX_FILE_SIZE', () => {
    // Exactly at the boundary
    expect(isWithinSizeLimit(MAX_FILE_SIZE)).toBe(true);
    // One byte over
    expect(isWithinSizeLimit(MAX_FILE_SIZE + 1)).toBe(false);
    // One byte under
    expect(isWithinSizeLimit(MAX_FILE_SIZE - 1)).toBe(true);
  });

  it('correctly handles boundary values at minimum (0 and 1)', () => {
    // Zero is rejected
    expect(isWithinSizeLimit(0)).toBe(false);
    // One byte is accepted (minimum valid size)
    expect(isWithinSizeLimit(1)).toBe(true);
  });
});
