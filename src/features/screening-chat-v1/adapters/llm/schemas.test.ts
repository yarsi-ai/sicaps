import { describe, it, expect } from 'vitest';
import { llmKeywordSchema, llmChatResponseSchema, llmOutputResponseSchema } from './schemas';

describe('llmKeywordSchema', () => {
  it('accepts valid keyword with high confidence', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: 'gatal malam hari',
      confidence: 'high',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid keyword with medium confidence', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: 'tangan',
      confidence: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid keyword with low confidence', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: 'mungkin',
      confidence: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty keyword', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: '',
      confidence: 'high',
    });
    expect(result.success).toBe(false);
  });

  it('rejects keyword exceeding 200 characters', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: 'a'.repeat(201),
      confidence: 'high',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid confidence level', () => {
    const result = llmKeywordSchema.safeParse({
      keyword: 'gatal',
      confidence: 'very_high',
    });
    expect(result.success).toBe(false);
  });
});

describe('llmChatResponseSchema', () => {
  const validResponse = {
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

  it('accepts a valid chat response', () => {
    const result = llmChatResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('accepts response with null next_category', () => {
    const result = llmChatResponseSchema.safeParse({
      ...validResponse,
      next_category: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts response with empty extraction arrays', () => {
    const result = llmChatResponseSchema.safeParse({
      ...validResponse,
      extraction: {
        intensitas: [],
        waktu: [],
        lokasi_tubuh: [],
        kontak: [],
        lesi: [],
        faktor_risiko: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects response with empty reply', () => {
    const result = llmChatResponseSchema.safeParse({
      ...validResponse,
      reply: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects response with missing extraction category', () => {
    const result = llmChatResponseSchema.safeParse({
      ...validResponse,
      extraction: {
        intensitas: [],
        waktu: [],
        lokasi_tubuh: [],
        kontak: [],
        lesi: [],
        // missing faktor_risiko
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects response with non-boolean should_follow_up', () => {
    const result = llmChatResponseSchema.safeParse({
      ...validResponse,
      should_follow_up: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('llmOutputResponseSchema', () => {
  it('accepts valid output response with all fields', () => {
    const result = llmOutputResponseSchema.safeParse({
      conclusion: 'Berdasarkan gejala Anda...',
      perceptionResponse: 'Anda mungkin meremehkan gejala.',
      recommendation: 'Segera kunjungi dokter.',
      personalizedSuggestion: 'Hindari kontak langsung.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts output response with null optional fields', () => {
    const result = llmOutputResponseSchema.safeParse({
      conclusion: 'Hasil skrining normal.',
      perceptionResponse: null,
      recommendation: 'Tetap jaga kebersihan.',
      personalizedSuggestion: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects output with empty conclusion', () => {
    const result = llmOutputResponseSchema.safeParse({
      conclusion: '',
      perceptionResponse: null,
      recommendation: 'Kunjungi dokter.',
      personalizedSuggestion: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects output with empty recommendation', () => {
    const result = llmOutputResponseSchema.safeParse({
      conclusion: 'Gejala menunjukkan risiko tinggi.',
      perceptionResponse: null,
      recommendation: '',
      personalizedSuggestion: null,
    });
    expect(result.success).toBe(false);
  });
});
