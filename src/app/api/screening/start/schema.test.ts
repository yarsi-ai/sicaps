import { describe, it, expect } from 'vitest';

import { startRequestSchema } from './schema';

const validInput = {
  demographics: {
    name: 'Test User',
    age: 15,
    gender: 'male' as const,
    educationLevel: 'junior_high' as const,
  },
  locale: 'id' as const,
};

describe('startRequestSchema', () => {
  it('parses valid input with full demographics and locale', () => {
    const result = startRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.demographics.age).toBe(15);
      expect(result.data.locale).toBe('id');
    }
  });

  describe('age boundaries', () => {
    it('rejects age 2 (below minimum)', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, age: 2 },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts age 3 (minimum boundary)', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, age: 3 },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts age 120 (maximum boundary)', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, age: 120 },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects age 121 (above maximum)', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, age: 121 },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects non-integer age', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, age: 15.5 },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('enum validation', () => {
    it('rejects invalid gender value', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, gender: 'other' },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid educationLevel value', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, educationLevel: 'masters' },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid locale value', () => {
      const input = { ...validInput, locale: 'fr' };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('name field', () => {
    it('accepts name at exactly 100 characters', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, name: 'a'.repeat(100) },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects name at 101 characters', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, name: 'a'.repeat(101) },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts name as null', () => {
      const input = {
        ...validInput,
        demographics: { ...validInput.demographics, name: null },
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts name when omitted', () => {
      const { name: _, ...demographicsWithoutName } = validInput.demographics;
      const input = {
        ...validInput,
        demographics: demographicsWithoutName,
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('rejects when demographics is missing', () => {
      const { demographics: _, ...input } = validInput;
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects when locale is missing', () => {
      const { locale: _, ...input } = validInput;
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects when age is missing from demographics', () => {
      const { age: _, ...demographicsWithoutAge } = validInput.demographics;
      const input = {
        ...validInput,
        demographics: demographicsWithoutAge,
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects when gender is missing from demographics', () => {
      const { gender: _, ...demographicsWithoutGender } = validInput.demographics;
      const input = {
        ...validInput,
        demographics: demographicsWithoutGender,
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects when educationLevel is missing from demographics', () => {
      const { educationLevel: _, ...demographicsWithoutEdu } = validInput.demographics;
      const input = {
        ...validInput,
        demographics: demographicsWithoutEdu,
      };
      const result = startRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
