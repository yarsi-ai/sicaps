import { describe, it, expect } from 'vitest';
import { getPills, getPillById } from './pills';
import type { CategoryName, Locale } from '../../domain/keywords/types';

const ALL_CATEGORIES: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

const ALL_LOCALES: Locale[] = ['id', 'en'];

describe('getPills', () => {
  it('returns pills for each category and locale', () => {
    for (const locale of ALL_LOCALES) {
      for (const category of ALL_CATEGORIES) {
        const pills = getPills(locale, category);
        expect(pills.length).toBeGreaterThan(0);
        for (const pill of pills) {
          expect(pill.category).toBe(category);
          expect(pill.locale).toBe(locale);
        }
      }
    }
  });

  it('returns 6 intensitas pills for locale id', () => {
    const pills = getPills('id', 'intensitas');
    expect(pills).toHaveLength(6);
  });

  it('returns 6 waktu pills for locale id', () => {
    const pills = getPills('id', 'waktu');
    expect(pills).toHaveLength(6);
  });

  it('returns 4 lokasi_tubuh pills for locale id', () => {
    const pills = getPills('id', 'lokasi_tubuh');
    expect(pills).toHaveLength(4);
  });

  it('returns 5 kontak pills for locale id', () => {
    const pills = getPills('id', 'kontak');
    expect(pills).toHaveLength(5);
  });

  it('returns 8 lesi pills for locale id', () => {
    const pills = getPills('id', 'lesi');
    expect(pills).toHaveLength(8);
  });

  it('returns 5 faktor_risiko pills for locale id', () => {
    const pills = getPills('id', 'faktor_risiko');
    expect(pills).toHaveLength(5);
  });

  it('has same pill count per category across locales', () => {
    for (const category of ALL_CATEGORIES) {
      const idPills = getPills('id', category);
      const enPills = getPills('en', category);
      expect(idPills.length).toBe(enPills.length);
    }
  });

  it('has same scores per pill ID across locales', () => {
    for (const category of ALL_CATEGORIES) {
      const idPills = getPills('id', category);
      const enPills = getPills('en', category);
      for (let i = 0; i < idPills.length; i++) {
        expect(idPills[i]!.id).toBe(enPills[i]!.id);
        expect(idPills[i]!.score).toBe(enPills[i]!.score);
        expect(idPills[i]!.isNegative).toBe(enPills[i]!.isNegative);
      }
    }
  });
});

describe('getPillById', () => {
  it('finds a pill by ID in locale id', () => {
    const pill = getPillById('id', 'int_severe');
    expect(pill).toBeDefined();
    expect(pill!.id).toBe('int_severe');
    expect(pill!.label).toBe('Gatal banget, parah, ga tahan');
    expect(pill!.score).toBe(1);
    expect(pill!.category).toBe('intensitas');
    expect(pill!.locale).toBe('id');
  });

  it('finds a pill by ID in locale en', () => {
    const pill = getPillById('en', 'int_severe');
    expect(pill).toBeDefined();
    expect(pill!.id).toBe('int_severe');
    expect(pill!.label).toBe('Very itchy, severe, unbearable');
    expect(pill!.score).toBe(1);
    expect(pill!.locale).toBe('en');
  });

  it('returns undefined for non-existent pill ID', () => {
    const pill = getPillById('id', 'nonexistent_pill');
    expect(pill).toBeUndefined();
  });

  it('finds pills across different categories', () => {
    expect(getPillById('id', 'waktu_night')).toBeDefined();
    expect(getPillById('id', 'lok_finger_webs')).toBeDefined();
    expect(getPillById('id', 'kontak_roommate')).toBeDefined();
    expect(getPillById('id', 'lesi_papules')).toBeDefined();
    expect(getPillById('id', 'risiko_boarding')).toBeDefined();
  });

  it('finds negative pills with isNegative flag', () => {
    const pill = getPillById('id', 'int_none');
    expect(pill).toBeDefined();
    expect(pill!.isNegative).toBe(true);
    expect(pill!.score).toBe(-2);
  });

  it('ensures all pill IDs are unique within a locale', () => {
    for (const locale of ALL_LOCALES) {
      const allIds = new Set<string>();
      for (const category of ALL_CATEGORIES) {
        const pills = getPills(locale, category);
        for (const pill of pills) {
          expect(allIds.has(pill.id)).toBe(false);
          allIds.add(pill.id);
        }
      }
    }
  });
});
