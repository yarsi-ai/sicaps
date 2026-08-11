import { describe, it, expect } from 'vitest';

import { ExtractionSchema, type RawExtraction, resultTextSchema } from './schemas';

describe('ExtractionSchema', () => {
  it('parses a fully populated extraction', () => {
    const input = {
      dimensi: {
        intensitas: { keywords: ['gatal_malam'], negasi: ['tidak_gatal'] },
        waktu: { keywords: ['2_minggu'], negasi: [] },
      },
      koreksi: [
        {
          dimensi: 'intensitas',
          keyword_dibatalkan: 'gatal_ringan',
          keyword_pengganti: 'gatal_malam',
        },
      ],
      emosi: 'takut',
      unmapped: ['kulit kering'],
    };

    const result = ExtractionSchema.parse(input);

    expect(result.dimensi.intensitas?.keywords).toEqual(['gatal_malam']);
    expect(result.dimensi.intensitas?.negasi).toEqual(['tidak_gatal']);
    expect(result.koreksi).toHaveLength(1);
    expect(result.koreksi[0].dimensi).toBe('intensitas');
    expect(result.emosi).toBe('takut');
    expect(result.unmapped).toEqual(['kulit kering']);
  });

  it('applies defaults for optional arrays', () => {
    const input = {
      dimensi: {
        lesi: { keywords: ['papul'] },
      },
      emosi: null,
    };

    const result = ExtractionSchema.parse(input);

    expect(result.dimensi.lesi?.negasi).toEqual([]);
    expect(result.koreksi).toEqual([]);
    expect(result.unmapped).toEqual([]);
    expect(result.emosi).toBeNull();
  });

  it('allows emosi to be null', () => {
    const input = {
      dimensi: {},
      emosi: null,
    };

    const result = ExtractionSchema.parse(input);
    expect(result.emosi).toBeNull();
  });

  it('accepts empty dimensi record', () => {
    const input = {
      dimensi: {},
      emosi: 'netral',
    };

    const result = ExtractionSchema.parse(input);
    expect(result.dimensi).toEqual({});
    expect(result.emosi).toBe('netral');
  });

  it('rejects invalid dimensi key', () => {
    const input = {
      dimensi: {
        invalid_dimensi: { keywords: ['something'] },
      },
      emosi: null,
    };

    const result = ExtractionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid emosi value', () => {
    const input = {
      dimensi: {},
      emosi: 'marah',
    };

    const result = ExtractionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid koreksi dimensi value', () => {
    const input = {
      dimensi: {},
      koreksi: [
        {
          dimensi: 'invalid_dim',
          keyword_dibatalkan: 'foo',
          keyword_pengganti: null,
        },
      ],
      emosi: null,
    };

    const result = ExtractionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects missing dimensi field', () => {
    const input = {
      emosi: 'santai',
    };

    const result = ExtractionSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('allows koreksi with null keyword_pengganti', () => {
    const input = {
      dimensi: {},
      koreksi: [
        {
          dimensi: 'waktu',
          keyword_dibatalkan: 'lama',
          keyword_pengganti: null,
        },
      ],
      emosi: null,
    };

    const result = ExtractionSchema.parse(input);
    expect(result.koreksi[0].keyword_pengganti).toBeNull();
  });

  it('satisfies RawExtraction type', () => {
    const extraction: RawExtraction = {
      dimensi: {
        kontak: { keywords: ['kontak_langsung'], negasi: [] },
      },
      koreksi: [],
      emosi: 'ingin_sembuh',
      unmapped: [],
    };

    const result = ExtractionSchema.parse(extraction);
    expect(result).toEqual(extraction);
  });
});

describe('resultTextSchema', () => {
  const validInput = {
    conclusion: 'Berdasarkan skrining, risiko skabies Anda tergolong sedang.',
    perceptionResponse: 'Kekhawatiran Anda sangat wajar dan kami memahami perasaan Anda.',
    recommendation:
      'Konsultasi ke dokter kulit\nJaga kebersihan tempat tidur\nHindari kontak kulit langsung',
    suggestion:
      'Sebaiknya segera periksakan diri ke puskesmas terdekat untuk pemeriksaan lanjutan.',
  };

  it('valid JSON passes', () => {
    const result = resultTextSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conclusion).toBe(validInput.conclusion);
      expect(result.data.perceptionResponse).toBe(validInput.perceptionResponse);
      expect(result.data.recommendation).toBe(validInput.recommendation);
      expect(result.data.suggestion).toBe(validInput.suggestion);
    }
  });

  it('missing field rejects', () => {
    const { conclusion: _, ...missingConclusion } = validInput;
    expect(resultTextSchema.safeParse(missingConclusion).success).toBe(false);

    const { perceptionResponse: __, ...missingPerception } = validInput;
    expect(resultTextSchema.safeParse(missingPerception).success).toBe(false);

    const { recommendation: ___, ...missingRecommendation } = validInput;
    expect(resultTextSchema.safeParse(missingRecommendation).success).toBe(false);

    const { suggestion: ____, ...missingSuggestion } = validInput;
    expect(resultTextSchema.safeParse(missingSuggestion).success).toBe(false);
  });

  it('string too short rejects', () => {
    // All fields have min(10), so a 9-char string should fail
    const tooShort = 'Pendek!!'; // 8 chars

    expect(resultTextSchema.safeParse({ ...validInput, conclusion: tooShort }).success).toBe(false);
    expect(
      resultTextSchema.safeParse({ ...validInput, perceptionResponse: tooShort }).success,
    ).toBe(false);
    expect(resultTextSchema.safeParse({ ...validInput, recommendation: tooShort }).success).toBe(
      false,
    );
    expect(resultTextSchema.safeParse({ ...validInput, suggestion: tooShort }).success).toBe(false);
  });

  it('string too long rejects', () => {
    // conclusion max 500
    expect(resultTextSchema.safeParse({ ...validInput, conclusion: 'a'.repeat(501) }).success).toBe(
      false,
    );

    // perceptionResponse max 300
    expect(
      resultTextSchema.safeParse({ ...validInput, perceptionResponse: 'a'.repeat(301) }).success,
    ).toBe(false);

    // recommendation max 500
    expect(
      resultTextSchema.safeParse({ ...validInput, recommendation: 'a'.repeat(501) }).success,
    ).toBe(false);

    // suggestion max 400
    expect(resultTextSchema.safeParse({ ...validInput, suggestion: 'a'.repeat(401) }).success).toBe(
      false,
    );
  });
});
