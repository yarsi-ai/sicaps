import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseLLMResponse, parseOutputResponse, extractReplyFromPartial } from './parser';

const validChatResponse = {
  reply: 'Terima kasih atas jawabannya.',
  extraction: {
    intensitas: [{ keyword: 'sangat gatal', confidence: 'high' as const }],
    waktu: [{ keyword: 'malam hari', confidence: 'medium' as const }],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  },
  categories_covered: ['intensitas', 'waktu'],
  next_category: 'lokasi_tubuh',
  should_follow_up: false,
};

const validOutputResponse = {
  conclusion: 'Berdasarkan gejala Anda, risiko skabies tergolong tinggi.',
  perceptionResponse: 'Anda mungkin meremehkan gejala.',
  recommendation: 'Segera kunjungi dokter.',
  personalizedSuggestion: 'Hindari kontak langsung dengan orang lain.',
};

describe('parseLLMResponse', () => {
  it('returns success for valid JSON matching schema', () => {
    const buffer = JSON.stringify(validChatResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toEqual(validChatResponse);
    }
  });

  it('returns success with null next_category', () => {
    const response = { ...validChatResponse, next_category: null };
    const buffer = JSON.stringify(response);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.next_category).toBeNull();
    }
  });

  it('returns partial when schema fails but reply is present', () => {
    const invalidResponse = {
      reply: 'Baik, saya mengerti keluhan Anda.',
      // missing extraction and other required fields
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.reply).toBe('Baik, saya mengerti keluhan Anda.');
    }
  });

  it('returns partial when extraction has wrong shape but reply exists', () => {
    const invalidResponse = {
      reply: 'Terima kasih.',
      extraction: 'invalid', // wrong type
      categories_covered: ['intensitas'],
      next_category: null,
      should_follow_up: true,
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.reply).toBe('Terima kasih.');
    }
  });

  it('returns failure with schema_validation_error when no reply in invalid JSON object', () => {
    const invalidResponse = {
      extraction: { intensitas: [] },
      categories_covered: [],
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with schema_validation_error when reply is empty string', () => {
    const invalidResponse = {
      reply: '',
      extraction: 'bad',
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with schema_validation_error when reply is whitespace-only', () => {
    const invalidResponse = {
      reply: '   \t\n  ',
      extraction: 'bad',
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with schema_validation_error when reply is not a string', () => {
    const invalidResponse = {
      reply: 123,
      extraction: 'bad',
    };
    const buffer = JSON.stringify(invalidResponse);
    const result = parseLLMResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with json_parse_error for invalid JSON', () => {
    const result = parseLLMResponse('not valid json at all');

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('json_parse_error');
    }
  });

  it('returns failure with json_parse_error for truncated JSON', () => {
    const result = parseLLMResponse('{"reply": "hello", "extraction');

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('json_parse_error');
    }
  });

  it('returns failure with json_parse_error for empty string', () => {
    const result = parseLLMResponse('');

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('json_parse_error');
    }
  });
});

describe('parseOutputResponse', () => {
  it('returns success for valid output JSON matching schema', () => {
    const buffer = JSON.stringify(validOutputResponse);
    const result = parseOutputResponse(buffer);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toEqual(validOutputResponse);
    }
  });

  it('returns success with null optional fields', () => {
    const response = {
      conclusion: 'Hasil skrining normal.',
      perceptionResponse: null,
      recommendation: 'Tetap jaga kebersihan.',
      personalizedSuggestion: null,
    };
    const buffer = JSON.stringify(response);
    const result = parseOutputResponse(buffer);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.perceptionResponse).toBeNull();
      expect(result.data.personalizedSuggestion).toBeNull();
    }
  });

  it('returns failure with schema_validation_error for missing required fields', () => {
    const response = {
      conclusion: 'Some conclusion.',
      // missing recommendation
    };
    const buffer = JSON.stringify(response);
    const result = parseOutputResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with schema_validation_error for empty conclusion', () => {
    const response = {
      conclusion: '',
      perceptionResponse: null,
      recommendation: 'Visit doctor.',
      personalizedSuggestion: null,
    };
    const buffer = JSON.stringify(response);
    const result = parseOutputResponse(buffer);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('schema_validation_error');
    }
  });

  it('returns failure with json_parse_error for invalid JSON', () => {
    const result = parseOutputResponse('{{invalid');

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('json_parse_error');
    }
  });

  it('returns failure with json_parse_error for empty string', () => {
    const result = parseOutputResponse('');

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.classification).toBe('json_parse_error');
    }
  });
});

describe('extractReplyFromPartial', () => {
  it('extracts reply from valid JSON', () => {
    const buffer = JSON.stringify({ reply: 'Hello there!', other: 'data' });
    const result = extractReplyFromPartial(buffer);

    expect(result).toBe('Hello there!');
  });

  it('extracts reply from truncated JSON using regex', () => {
    const buffer = '{"reply": "Baik, saya mengerti", "extraction": {"intensita';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBe('Baik, saya mengerti');
  });

  it('handles escaped quotes in reply value', () => {
    const buffer = '{"reply": "Dia berkata \\"halo\\"", "broken';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBe('Dia berkata "halo"');
  });

  it('handles newlines in reply value', () => {
    const buffer = '{"reply": "Line 1\\nLine 2", "broken';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBe('Line 1\nLine 2');
  });

  it('returns null for empty reply string', () => {
    const buffer = JSON.stringify({ reply: '' });
    const result = extractReplyFromPartial(buffer);

    expect(result).toBeNull();
  });

  it('returns null for whitespace-only reply', () => {
    const buffer = JSON.stringify({ reply: '   ' });
    const result = extractReplyFromPartial(buffer);

    expect(result).toBeNull();
  });

  it('returns null when no reply field exists', () => {
    const buffer = '{"extraction": {"intensitas": []}}';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBeNull();
  });

  it('returns null for completely garbled input', () => {
    const buffer = 'this is not json at all';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBeNull();
  });

  it('returns null for buffer with no recognizable reply pattern', () => {
    const buffer = '{"data": [1, 2, 3], "status": "ok"}';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBeNull();
  });

  it('extracts reply when there is extra whitespace around colon', () => {
    const buffer = '{"reply" : "Spaced out value", "x": 1';
    const result = extractReplyFromPartial(buffer);

    expect(result).toBe('Spaced out value');
  });
});

/**
 * Property 3: Invalid JSON always returns json_parse_error
 *
 * For any string that is not valid JSON, parseLLMResponse SHALL return
 * a failure result with classification json_parse_error.
 *
 * **Validates: Requirements 5.4**
 */
describe('Property 3: Invalid JSON always returns json_parse_error', () => {
  it('any non-JSON string produces failure with json_parse_error', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        (invalidJson) => {
          const result = parseLLMResponse(invalidJson);

          expect(result.status).toBe('failure');
          if (result.status === 'failure') {
            expect(result.classification).toBe('json_parse_error');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- Property-Based Tests ---

/**
 * Property 2: Partial recovery extracts reply from schema-invalid JSON
 *
 * For any valid JSON string containing a `reply` key with a non-empty trimmed
 * string value, if the JSON fails llmChatResponseSchema validation, then
 * parseLLMResponse SHALL return a `partial` result containing that exact reply string.
 *
 * **Validates: Requirements 5.5**
 */
describe('Property 2: Partial recovery extracts reply from schema-invalid JSON', () => {
  // Arbitrary: non-empty string with at least 1 non-whitespace character
  const nonEmptyReplyArb = fc
    .string({ minLength: 1, maxLength: 500 })
    .filter((s) => s.trim().length >= 1);

  // Arbitrary: schema-invalid objects that have a reply field but fail full schema validation
  // Strategy: generate objects with valid reply but missing/wrong extraction shape
  const schemaInvalidWithReplyArb = fc.oneof(
    // Case 1: reply only, no other fields
    nonEmptyReplyArb.map((reply) => ({ reply })),

    // Case 2: reply + extraction as wrong type (string instead of object)
    fc.tuple(nonEmptyReplyArb, fc.string()).map(([reply, extraction]) => ({
      reply,
      extraction,
    })),

    // Case 3: reply + extraction as number
    fc.tuple(nonEmptyReplyArb, fc.integer()).map(([reply, extraction]) => ({
      reply,
      extraction,
    })),

    // Case 4: reply + partially correct structure but missing required fields
    nonEmptyReplyArb.map((reply) => ({
      reply,
      extraction: { intensitas: [] },
      // missing categories_covered, next_category, should_follow_up
    })),

    // Case 5: reply + all fields present but extraction has wrong array content
    fc.tuple(nonEmptyReplyArb, fc.boolean()).map(([reply, shouldFollowUp]) => ({
      reply,
      extraction: {
        intensitas: [{ invalid: true }],
        waktu: [],
        lokasi_tubuh: [],
        kontak: [],
        lesi: [],
        faktor_risiko: [],
      },
      categories_covered: [],
      next_category: null,
      should_follow_up: shouldFollowUp,
    })),

    // Case 6: reply + extra unknown fields (schema still fails due to missing required)
    fc.tuple(nonEmptyReplyArb, fc.jsonValue()).map(([reply, extra]) => ({
      reply,
      extra,
    })),
  );

  it('returns partial with correct reply for schema-invalid objects containing a reply field', () => {
    fc.assert(
      fc.property(schemaInvalidWithReplyArb, (obj) => {
        const buffer = JSON.stringify(obj);
        const result = parseLLMResponse(buffer);

        expect(result.status).toBe('partial');
        if (result.status === 'partial') {
          expect(result.reply).toBe(obj.reply);
        }
      }),
      { numRuns: 100 },
    );
  });
});
