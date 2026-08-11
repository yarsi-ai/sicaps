import { describe, it, expect } from 'vitest';
import { validateExtraction } from './validator';
import { getPromptKeywordList } from '../keywords/prompt-keywords';

describe('validateExtraction', () => {
  describe('valid keywords pass through', () => {
    it('accepts canonical keywords in known dimensions (id)', () => {
      const extraction = {
        intensitas: { keywords: ['gatal malam hari', 'gatal parah'] },
        waktu: { keywords: ['lebih 2 minggu'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari', 'gatal parah'], negasi: [] },
        waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
      });
      expect(result.dropped).toEqual([]);
    });

    it('accepts canonical keywords in known dimensions (en)', () => {
      const extraction = {
        intensitas: { keywords: ['nighttime itching', 'severe itching'] },
        lokasi_tubuh: { keywords: ['between fingers'] },
      };

      const result = validateExtraction(extraction, 'en');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['nighttime itching', 'severe itching'], negasi: [] },
        lokasi_tubuh: { keywords: ['between fingers'], negasi: [] },
      });
      expect(result.dropped).toEqual([]);
    });
  });

  describe('unknown keywords are dropped', () => {
    it('drops keywords not in the canonical list', () => {
      const extraction = {
        intensitas: { keywords: ['gatal malam hari', 'gatal aneh sekali'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari'], negasi: [] },
      });
      expect(result.dropped).toEqual(['gatal aneh sekali']);
    });

    it('drops all keywords from an unknown dimension', () => {
      const extraction = {
        dimensi_palsu: { keywords: ['keyword1', 'keyword2'], negasi: ['neg1'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({});
      expect(result.dropped).toEqual(['keyword1', 'keyword2', 'neg1']);
    });
  });

  describe('negasi validation', () => {
    it('validates negasi against the negatif canonical list', () => {
      const extraction = {
        intensitas: {
          keywords: ['gatal malam hari'],
          negasi: ['sudah sembuh', 'tidak valid'],
        },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari'], negasi: ['sudah sembuh'] },
      });
      expect(result.dropped).toEqual(['tidak valid']);
    });

    it('handles missing negasi field as empty array', () => {
      const extraction = {
        intensitas: { keywords: ['gatal malam hari'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari'], negasi: [] },
      });
      expect(result.dropped).toEqual([]);
    });

    it('includes dimension when only negasi is valid', () => {
      const extraction = {
        intensitas: {
          keywords: ['invalid keyword'],
          negasi: ['tidak gatal'],
        },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: [], negasi: ['tidak gatal'] },
      });
      expect(result.dropped).toEqual(['invalid keyword']);
    });
  });

  describe('dimension exclusion', () => {
    it('excludes dimension from valid when all keywords and negasi are dropped', () => {
      const extraction = {
        intensitas: {
          keywords: ['not a keyword'],
          negasi: ['also not valid'],
        },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({});
      expect(result.dropped).toEqual(['not a keyword', 'also not valid']);
    });

    it('excludes dimension with empty keywords and no negasi', () => {
      const extraction = {
        intensitas: { keywords: [] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({});
      expect(result.dropped).toEqual([]);
    });
  });

  describe('mixed input', () => {
    it('handles multiple dimensions with a mix of valid and invalid', () => {
      const extraction = {
        intensitas: { keywords: ['gatal malam hari', 'bogus'], negasi: ['sudah sembuh'] },
        waktu: { keywords: ['lebih 2 minggu', 'invalid time'] },
        dimensi_palsu: { keywords: ['mystery'] },
        lokasi_tubuh: { keywords: ['sela jari'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari'], negasi: ['sudah sembuh'] },
        waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
      });
      expect(result.dropped).toContain('bogus');
      expect(result.dropped).toContain('invalid time');
      expect(result.dropped).toContain('mystery');
      expect(result.dropped).toHaveLength(3);
    });
  });

  describe('locale switching', () => {
    it('uses English canonical list for en locale', () => {
      const extraction = {
        intensitas: { keywords: ['nighttime itching', 'gatal malam hari'] },
      };

      const result = validateExtraction(extraction, 'en');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['nighttime itching'], negasi: [] },
      });
      expect(result.dropped).toEqual(['gatal malam hari']);
    });

    it('uses Indonesian canonical list for id locale', () => {
      const extraction = {
        intensitas: { keywords: ['gatal malam hari', 'nighttime itching'] },
      };

      const result = validateExtraction(extraction, 'id');

      expect(result.valid).toEqual({
        intensitas: { keywords: ['gatal malam hari'], negasi: [] },
      });
      expect(result.dropped).toEqual(['nighttime itching']);
    });
  });
});

describe('validateExtraction locale-matched prompt vocabulary', () => {
  it('accepts Indonesian prompt keywords on an id session', () => {
    const result = validateExtraction({ intensitas: { keywords: ['parah'], negasi: [] } }, 'id');

    expect(result.valid.intensitas?.keywords).toEqual(['parah']);
    expect(result.dropped).toEqual([]);
  });

  it('accepts English prompt keywords on an en session', () => {
    const result = validateExtraction({ intensitas: { keywords: ['severe'], negasi: [] } }, 'en');

    expect(result.valid.intensitas?.keywords).toEqual(['severe']);
    expect(result.dropped).toEqual([]);
  });

  it('drops Indonesian slang on an en session', () => {
    const result = validateExtraction({ intensitas: { keywords: ['parah'], negasi: [] } }, 'en');

    expect(result.valid.intensitas).toBeUndefined();
    expect(result.dropped).toContain('parah');
  });

  it('drops English slang on an id session', () => {
    const result = validateExtraction(
      { lokasi_tubuh: { keywords: ['between fingers'], negasi: [] } },
      'id',
    );

    expect(result.valid.lokasi_tubuh).toBeUndefined();
    expect(result.dropped).toContain('between fingers');
  });

  it('accepts English negation keywords on an en session', () => {
    const result = validateExtraction(
      { intensitas: { keywords: [], negasi: ['no itching'] } },
      'en',
    );

    expect(result.valid.intensitas?.negasi).toEqual(['no itching']);
  });

  it('accepts every prompt keyword offered for its own locale', () => {
    for (const locale of ['id', 'en'] as const) {
      for (const [dimension, keywords] of Object.entries(getPromptKeywordList(locale))) {
        if (dimension === 'negatif') continue;

        const result = validateExtraction({ [dimension]: { keywords, negasi: [] } }, locale);

        expect(result.dropped).toEqual([]);
        expect(result.valid[dimension]?.keywords).toEqual(keywords);
      }
    }
  });
});
