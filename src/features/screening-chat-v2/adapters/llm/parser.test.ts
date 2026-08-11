import { describe, it, expect } from 'vitest';

import { parseExtraction, extractReplyFromStream } from './parser';

describe('parseExtraction', () => {
  it('returns success with valid extraction JSON', () => {
    const raw = JSON.stringify({
      dimensi: {
        intensitas: { keywords: ['gatal_malam'], negasi: [] },
        waktu: { keywords: ['2_minggu'], negasi: [] },
      },
      emosi: 'takut',
      koreksi: [],
      unmapped: [],
    });

    const result = parseExtraction(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dimensi.intensitas?.keywords).toEqual(['gatal_malam']);
      expect(result.data.emosi).toBe('takut');
    }
  });

  it('applies defaults for optional fields', () => {
    const raw = JSON.stringify({
      dimensi: {
        lesi: { keywords: ['papul'] },
      },
      emosi: null,
    });

    const result = parseExtraction(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.koreksi).toEqual([]);
      expect(result.data.unmapped).toEqual([]);
      expect(result.data.dimensi.lesi?.negasi).toEqual([]);
    }
  });

  it('returns error for invalid JSON', () => {
    const result = parseExtraction('not valid json {{{');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('JSON parse failed');
    }
  });

  it('returns error for empty string', () => {
    const result = parseExtraction('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('JSON parse failed');
    }
  });

  it('returns error when Zod validation fails (invalid dimensi key)', () => {
    const raw = JSON.stringify({
      dimensi: {
        invalid_key: { keywords: ['foo'] },
      },
      emosi: null,
    });

    const result = parseExtraction(raw);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('JSON parse failed');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns error when Zod validation fails (invalid emosi)', () => {
    const raw = JSON.stringify({
      dimensi: {},
      emosi: 'invalid_emotion',
    });

    const result = parseExtraction(raw);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('JSON parse failed');
    }
  });

  it('returns error when dimensi field is missing', () => {
    const raw = JSON.stringify({ emosi: 'netral' });

    const result = parseExtraction(raw);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('JSON parse failed');
    }
  });

  it('never throws even with unexpected input types', () => {
    expect(() => parseExtraction('null')).not.toThrow();
    expect(() => parseExtraction('123')).not.toThrow();
    expect(() => parseExtraction('"string"')).not.toThrow();
    expect(() => parseExtraction('[]')).not.toThrow();
  });

  it('handles valid JSON that is not an object', () => {
    const result = parseExtraction('[]');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('JSON parse failed');
    }
  });
});

describe('extractReplyFromStream', () => {
  it('joins multiple chunks into a single string', () => {
    const chunks = ['Hello', ' ', 'world', '!'];

    const result = extractReplyFromStream(chunks);

    expect(result).toBe('Hello world!');
  });

  it('returns empty string for empty chunks array', () => {
    const result = extractReplyFromStream([]);

    expect(result).toBe('');
  });

  it('returns the single chunk unchanged for one-element array', () => {
    const result = extractReplyFromStream(['only one chunk']);

    expect(result).toBe('only one chunk');
  });

  it('preserves whitespace and newlines in chunks', () => {
    const chunks = ['Baris pertama\n', 'Baris kedua\n', 'Baris ketiga'];

    const result = extractReplyFromStream(chunks);

    expect(result).toBe('Baris pertama\nBaris kedua\nBaris ketiga');
  });

  it('handles chunks with special characters', () => {
    const chunks = ['Skor: ', '7', ' (', 'HIGH', ')'];

    const result = extractReplyFromStream(chunks);

    expect(result).toBe('Skor: 7 (HIGH)');
  });
});
