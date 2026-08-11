import { describe, it, expect } from 'vitest';

import {
  detectConflict,
  resolveConflict,
  buildClarificationQuestion,
  parseClarificationResponse,
} from './conflict';
import type { ConflictState, ConflictDimension } from './conflict';
import { getBotText } from './bot-text';

describe('detectConflict', () => {
  it('returns true when extractedValue=true and chipsValue=false (conflict)', () => {
    const result = detectConflict(true, false);

    expect(result).toBe(true);
  });

  it('returns true when extractedValue=false and chipsValue=true (conflict)', () => {
    const result = detectConflict(false, true);

    expect(result).toBe(true);
  });

  it('returns false when extractedValue=true and chipsValue=true (no conflict)', () => {
    const result = detectConflict(true, true);

    expect(result).toBe(false);
  });

  it('returns false when extractedValue=false and chipsValue=false (no conflict)', () => {
    const result = detectConflict(false, false);

    expect(result).toBe(false);
  });

  it('returns false when extractedValue=null and chipsValue=false (extraction absent)', () => {
    const result = detectConflict(null, false);

    expect(result).toBe(false);
  });

  it('returns false when extractedValue=null and chipsValue=true (extraction absent)', () => {
    const result = detectConflict(null, true);

    expect(result).toBe(false);
  });
});

describe('resolveConflict', () => {
  const baseConflict: ConflictState = {
    dimension: 'kontak',
    extractedValue: true,
    chipsValue: false,
    clarificationAsked: true,
    resolved: false,
    finalValue: false,
  };

  it('resolves with userClarifiedValue=true', () => {
    const result = resolveConflict(baseConflict, true);

    expect(result.resolved).toBe(true);
    expect(result.finalValue).toBe(true);
  });

  it('resolves with userClarifiedValue=false', () => {
    const result = resolveConflict(baseConflict, false);

    expect(result.resolved).toBe(true);
    expect(result.finalValue).toBe(false);
  });

  it('resolves with chipsValue when userClarifiedValue=null (chips wins)', () => {
    const conflict: ConflictState = {
      ...baseConflict,
      chipsValue: false,
    };

    const result = resolveConflict(conflict, null);

    expect(result.resolved).toBe(true);
    expect(result.finalValue).toBe(false);
  });

  it('resolves with chipsValue=true when userClarifiedValue=null', () => {
    const conflict: ConflictState = {
      ...baseConflict,
      chipsValue: true,
    };

    const result = resolveConflict(conflict, null);

    expect(result.resolved).toBe(true);
    expect(result.finalValue).toBe(true);
  });
});

describe('buildClarificationQuestion', () => {
  it('returns one of the kontak templates for dimension kontak', () => {
    const result = buildClarificationQuestion('kontak');

    const validTemplates = [
      'Tadi kamu sempat cerita soal temen yang gatal juga — jadi sebenernya ada atau nggak yang gatal serupa di sekitarmu?',
      'Hmm, tadi kayaknya ada yang bilang orang dekat juga gatal — bener nggak sih? Boleh konfirmasi.',
      'Sebelumnya kamu bilang ada yang gatal juga — tapi barusan bilang tidak. Yang mana yang bener nih?',
    ];
    expect(validTemplates).toContain(result);
  });

  it('returns generic fallback question for unknown dimension', () => {
    const result = buildClarificationQuestion('unknown');

    expect(result).toBe('Boleh dipastikan lagi jawaban tadi?');
  });

  it('returns one of the lokasi templates for dimension lokasi', () => {
    const result = buildClarificationQuestion('lokasi');

    const validTemplates = [
      'Tadi soal lokasi gatalnya agak beda sama yang dipilih — boleh dipastiin lagi area mana aja yang gatal?',
      'Hmm, kayaknya info lokasi gatal tadi agak beda — yang bener di mana aja nih?',
    ];
    expect(validTemplates).toContain(result);
  });
});

describe('buildClarificationQuestion locale handling', () => {
  const dimensions: ConflictDimension[] = ['kontak', 'lokasi', 'asrama', 'tukar_alat'];

  for (const dimension of dimensions) {
    it(`returns English copy for ${dimension} on the en locale`, () => {
      const result = buildClarificationQuestion(dimension, 'en');

      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/[a-z]/);
      expect(result).not.toMatch(/boleh|kamu bilang|gimana nih/i);
    });
  }

  it('defaults to Indonesian when no locale is given', () => {
    const result = buildClarificationQuestion('kontak');

    expect(result).toMatch(/gatal/i);
  });

  it('falls back to the locale-specific generic question for an unknown dimension', () => {
    expect(buildClarificationQuestion('unknown', 'en')).toBe(getBotText('en').clarifyGeneric);
    expect(buildClarificationQuestion('unknown', 'id')).toBe(getBotText('id').clarifyGeneric);
  });
});

describe('parseClarificationResponse with English answers', () => {
  it('reads "yes" as affirmative', () => {
    expect(parseClarificationResponse('yes', 'kontak', true)).toBe(true);
  });

  it('reads "no" as negative', () => {
    expect(parseClarificationResponse('no', 'kontak', true)).toBe(false);
  });

  it('reads "nobody" as negative', () => {
    expect(parseClarificationResponse('nobody', 'kontak', false)).toBe(false);
  });

  it('still returns null for an ambiguous English answer', () => {
    expect(parseClarificationResponse('maybe sometimes', 'kontak', true)).toBeNull();
  });
});
