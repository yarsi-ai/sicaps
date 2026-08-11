import { describe, expect, it } from 'vitest';
import type { CategoryName, CategoryExtraction } from '../keywords/types';
import type { SessionContext } from '../types';
import { buildCategoryTracker, getNextInstruction } from './instruction';

// ─── Helpers ───

function makeContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'test-session',
    state: 'CHATTING',
    theme: 'hybrid',
    locale: 'id',
    turn: 1,
    categoriesCovered: [],
    categoriesFollowedUp: [],
    followUpTarget: null,
    offTopicCount: 0,
    shortAnswerCount: 0,
    ...overrides,
  };
}

function makeEmptyExtraction(): CategoryExtraction {
  return {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };
}

function makeLowConfidenceExtraction(category: CategoryName): CategoryExtraction {
  return {
    ...makeEmptyExtraction(),
    [category]: [{ keyword: 'test-keyword', confidence: 'low' }],
  };
}

function makeMediumConfidenceExtraction(category: CategoryName): CategoryExtraction {
  return {
    ...makeEmptyExtraction(),
    [category]: [{ keyword: 'test-keyword', confidence: 'medium' }],
  };
}

// ─── buildCategoryTracker ───

describe('buildCategoryTracker', () => {
  it('returns all categories uncovered when no categories provided', () => {
    const tracker = buildCategoryTracker([], []);

    expect(tracker.intensitas).toEqual({
      covered: false,
      confidence: null,
      followUpUsed: false,
      exhausted: false,
    });
    expect(tracker.waktu).toEqual({
      covered: false,
      confidence: null,
      followUpUsed: false,
      exhausted: false,
    });
    expect(tracker.faktor_risiko).toEqual({
      covered: false,
      confidence: null,
      followUpUsed: false,
      exhausted: false,
    });
  });

  it('marks categories as covered when in categoriesCovered', () => {
    const tracker = buildCategoryTracker(['intensitas', 'waktu'], []);

    expect(tracker.intensitas.covered).toBe(true);
    expect(tracker.waktu.covered).toBe(true);
    expect(tracker.lokasi_tubuh.covered).toBe(false);
  });

  it('marks followUpUsed when in categoriesFollowedUp', () => {
    const tracker = buildCategoryTracker([], ['kontak', 'lesi']);

    expect(tracker.kontak.followUpUsed).toBe(true);
    expect(tracker.lesi.followUpUsed).toBe(true);
    expect(tracker.intensitas.followUpUsed).toBe(false);
  });

  it('marks exhausted only when both covered AND followUpUsed', () => {
    const tracker = buildCategoryTracker(['intensitas', 'waktu'], ['intensitas', 'kontak']);

    // covered + followUpUsed → exhausted
    expect(tracker.intensitas.exhausted).toBe(true);
    // covered only → not exhausted
    expect(tracker.waktu.exhausted).toBe(false);
    // followUpUsed only → not exhausted
    expect(tracker.kontak.exhausted).toBe(false);
    // neither → not exhausted
    expect(tracker.lokasi_tubuh.exhausted).toBe(false);
  });

  it('sets confidence to null for all categories', () => {
    const tracker = buildCategoryTracker(['intensitas'], ['intensitas']);

    for (const category of Object.values(tracker)) {
      expect(category.confidence).toBeNull();
    }
  });

  it('returns all 6 scoring categories', () => {
    const tracker = buildCategoryTracker([], []);
    const keys = Object.keys(tracker);

    expect(keys).toHaveLength(6);
    expect(keys).toContain('intensitas');
    expect(keys).toContain('waktu');
    expect(keys).toContain('lokasi_tubuh');
    expect(keys).toContain('kontak');
    expect(keys).toContain('lesi');
    expect(keys).toContain('faktor_risiko');
  });
});

// ─── getNextInstruction — Completion ───

describe('getNextInstruction', () => {
  describe('completion', () => {
    it('returns COMPLETE when all 6 categories are covered', () => {
      const allCategories: CategoryName[] = [
        'intensitas',
        'waktu',
        'lokasi_tubuh',
        'kontak',
        'lesi',
        'faktor_risiko',
      ];
      const tracker = buildCategoryTracker(allCategories, []);
      const context = makeContext({ categoriesCovered: allCategories });

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('COMPLETE');
      expect(result.targetCategory).toBeNull();
      expect(result.isFollowUp).toBe(false);
    });

    it('returns COMPLETE when categories are resolved via followUpUsed', () => {
      // Some covered naturally, some exhausted via followUp
      const tracker = buildCategoryTracker(
        ['intensitas', 'waktu', 'lokasi_tubuh'],
        ['kontak', 'lesi', 'faktor_risiko'],
      );
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('COMPLETE');
    });

    it('returns COMPLETE when all categories have followUpUsed', () => {
      const allCategories: CategoryName[] = [
        'intensitas',
        'waktu',
        'lokasi_tubuh',
        'kontak',
        'lesi',
        'faktor_risiko',
      ];
      const tracker = buildCategoryTracker([], allCategories);
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('COMPLETE');
    });
  });

  // ─── getNextInstruction — Follow-up priority ───

  describe('follow-up priority', () => {
    it('returns FOLLOW_UP for uncovered category with only low-confidence keywords', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();
      const extraction = makeLowConfidenceExtraction('intensitas');

      const result = getNextInstruction(context, tracker, extraction);

      expect(result.type).toBe('FOLLOW_UP');
      expect(result.targetCategory).toBe('intensitas');
      expect(result.isFollowUp).toBe(true);
    });

    it('does not FOLLOW_UP if category already has followUpUsed', () => {
      const tracker = buildCategoryTracker([], ['intensitas']);
      const context = makeContext();
      const extraction = makeLowConfidenceExtraction('intensitas');

      const result = getNextInstruction(context, tracker, extraction);

      // Should explore next category, not follow up on intensitas
      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('waktu');
    });

    it('does not FOLLOW_UP if category is already covered', () => {
      const tracker = buildCategoryTracker(['intensitas'], []);
      const context = makeContext();
      const extraction = makeLowConfidenceExtraction('intensitas');

      const result = getNextInstruction(context, tracker, extraction);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('waktu');
    });

    it('does not FOLLOW_UP if extraction has medium-confidence keywords', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();
      const extraction = makeMediumConfidenceExtraction('intensitas');

      const result = getNextInstruction(context, tracker, extraction);

      // Medium confidence should not trigger follow-up
      expect(result.type).not.toBe('FOLLOW_UP');
    });

    it('selects follow-up in default order when multiple categories have low confidence', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();
      const extraction: CategoryExtraction = {
        ...makeEmptyExtraction(),
        waktu: [{ keyword: 'lama', confidence: 'low' }],
        intensitas: [{ keyword: 'gatal', confidence: 'low' }],
      };

      const result = getNextInstruction(context, tracker, extraction);

      // intensitas comes before waktu in default order
      expect(result.type).toBe('FOLLOW_UP');
      expect(result.targetCategory).toBe('intensitas');
    });

    it('skips follow-up category if followUpUsed, selects next pending', () => {
      const tracker = buildCategoryTracker([], ['intensitas']);
      const context = makeContext();
      const extraction: CategoryExtraction = {
        ...makeEmptyExtraction(),
        intensitas: [{ keyword: 'gatal', confidence: 'low' }],
        waktu: [{ keyword: 'lama', confidence: 'low' }],
      };

      const result = getNextInstruction(context, tracker, extraction);

      expect(result.type).toBe('FOLLOW_UP');
      expect(result.targetCategory).toBe('waktu');
    });
  });

  // ─── getNextInstruction — Default order exploration ───

  describe('default order exploration', () => {
    it('selects first uncovered category (intensitas) when no extraction', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('intensitas');
      expect(result.isFollowUp).toBe(false);
    });

    it('skips covered categories and selects next in order', () => {
      const tracker = buildCategoryTracker(['intensitas', 'waktu'], []);
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('lokasi_tubuh');
    });

    it('skips categories with followUpUsed', () => {
      const tracker = buildCategoryTracker(['intensitas'], ['waktu', 'lokasi_tubuh']);
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('kontak');
    });

    it('selects faktor_risiko as last category', () => {
      const tracker = buildCategoryTracker(
        ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi'],
        [],
      );
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('faktor_risiko');
    });

    it('explores next category when extraction is empty', () => {
      const tracker = buildCategoryTracker(['intensitas'], []);
      const context = makeContext();
      const extraction = makeEmptyExtraction();

      const result = getNextInstruction(context, tracker, extraction);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.targetCategory).toBe('waktu');
    });
  });

  // ─── getNextInstruction — Null extraction handling ───

  describe('null extraction', () => {
    it('does not trigger follow-up when extraction is null', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();

      const result = getNextInstruction(context, tracker, null);

      expect(result.type).toBe('EXPLORE_CATEGORY');
      expect(result.isFollowUp).toBe(false);
    });
  });

  // ─── getNextInstruction — Mixed scenarios ───

  describe('mixed scenarios', () => {
    it('prioritizes follow-up over default order exploration', () => {
      // intensitas is covered, waktu has low confidence, lokasi_tubuh is uncovered
      const tracker = buildCategoryTracker(['intensitas'], []);
      const context = makeContext();
      const extraction = makeLowConfidenceExtraction('waktu');

      const result = getNextInstruction(context, tracker, extraction);

      // Should follow-up on waktu, not explore lokasi_tubuh
      expect(result.type).toBe('FOLLOW_UP');
      expect(result.targetCategory).toBe('waktu');
    });

    it('handles extraction with mix of confidence levels for same category', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();
      const extraction: CategoryExtraction = {
        ...makeEmptyExtraction(),
        intensitas: [
          { keyword: 'gatal', confidence: 'low' },
          { keyword: 'parah', confidence: 'medium' },
        ],
      };

      const result = getNextInstruction(context, tracker, extraction);

      // Has medium confidence → not a follow-up candidate
      expect(result.type).not.toBe('FOLLOW_UP');
    });

    it('handles extraction with high confidence — no follow-up triggered', () => {
      const tracker = buildCategoryTracker([], []);
      const context = makeContext();
      const extraction: CategoryExtraction = {
        ...makeEmptyExtraction(),
        intensitas: [{ keyword: 'sangat gatal', confidence: 'high' }],
      };

      const result = getNextInstruction(context, tracker, extraction);

      expect(result.type).not.toBe('FOLLOW_UP');
    });
  });
});
