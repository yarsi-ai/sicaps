import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import type { CategoryExtraction } from '../keywords/types';
import { createInitialContext, isTerminalState, transition } from './state-machine';
import type { SessionContext, TransitionError, TransitionResult } from '../types';

// ─── Helpers ───

function makeChatContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'test-session-1',
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

function isTransitionResult(
  result: TransitionResult | TransitionError,
): result is TransitionResult {
  return 'newState' in result && 'context' in result;
}

function isTransitionError(result: TransitionResult | TransitionError): result is TransitionError {
  return 'type' in result && result.type === 'INVALID_TRANSITION';
}

// ─── createInitialContext ───

describe('createInitialContext', () => {
  it('creates context with valid id locale and elementary education', () => {
    const ctx = createInitialContext('sess-1', 'id', 'elementary');

    expect(ctx.sessionId).toBe('sess-1');
    expect(ctx.state).toBe('PRE_CHAT');
    expect(ctx.theme).toBe('playful');
    expect(ctx.locale).toBe('id');
    expect(ctx.turn).toBe(0);
    expect(ctx.categoriesCovered).toEqual([]);
    expect(ctx.categoriesFollowedUp).toEqual([]);
    expect(ctx.followUpTarget).toBeNull();
    expect(ctx.offTopicCount).toBe(0);
    expect(ctx.shortAnswerCount).toBe(0);
  });

  it('creates context with en locale and hybrid theme for junior_high', () => {
    const ctx = createInitialContext('sess-2', 'en', 'junior_high');

    expect(ctx.locale).toBe('en');
    expect(ctx.theme).toBe('hybrid');
  });

  it('defaults to hybrid theme when educationLevel is undefined', () => {
    const ctx = createInitialContext('sess-3', 'id', undefined);

    expect(ctx.theme).toBe('hybrid');
  });

  it('throws ValidationError for empty sessionId', () => {
    expect(() => createInitialContext('', 'id', undefined)).toThrow(ValidationError);
  });

  it('throws ValidationError for unsupported locale', () => {
    expect(() => createInitialContext('sess-4', 'fr' as 'id', undefined)).toThrow(ValidationError);
  });

  it('throws ValidationError for null locale', () => {
    expect(() => createInitialContext('sess-5', null as unknown as 'id', undefined)).toThrow(
      ValidationError,
    );
  });
});

// ─── transition — valid transitions ───

describe('transition', () => {
  describe('DEMOGRAPHICS_SUBMITTED', () => {
    it('transitions PRE_CHAT → CHATTING', () => {
      const ctx = makeChatContext({ state: 'PRE_CHAT' });
      const result = transition(ctx, { type: 'DEMOGRAPHICS_SUBMITTED' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('CHATTING');
        expect(result.context.state).toBe('CHATTING');
      }
    });

    it('returns error from CHATTING state', () => {
      const ctx = makeChatContext({ state: 'CHATTING' });
      const result = transition(ctx, { type: 'DEMOGRAPHICS_SUBMITTED' });

      expect(isTransitionError(result)).toBe(true);
      if (isTransitionError(result)) {
        expect(result.from).toBe('CHATTING');
        expect(result.event).toBe('DEMOGRAPHICS_SUBMITTED');
      }
    });
  });

  describe('EXTRACTION_RECEIVED', () => {
    it('stays in CHATTING and increments turn', () => {
      const ctx = makeChatContext({ turn: 1 });
      const extraction = makeEmptyExtraction();
      const result = transition(ctx, {
        type: 'EXTRACTION_RECEIVED',
        extraction,
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('CHATTING');
        expect(result.context.turn).toBe(2);
      }
    });

    it('marks categories covered when extraction has medium/high confidence', () => {
      const ctx = makeChatContext({ categoriesCovered: [] });
      const extraction = makeEmptyExtraction();
      extraction.intensitas = [{ keyword: 'gatal parah', confidence: 'high' }];
      extraction.waktu = [{ keyword: 'seminggu', confidence: 'medium' }];

      const result = transition(ctx, {
        type: 'EXTRACTION_RECEIVED',
        extraction,
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.context.categoriesCovered).toContain('intensitas');
        expect(result.context.categoriesCovered).toContain('waktu');
        expect(result.context.categoriesCovered).toHaveLength(2);
      }
    });

    it('does not re-add already-covered categories', () => {
      const ctx = makeChatContext({
        categoriesCovered: ['intensitas'],
      });
      const extraction = makeEmptyExtraction();
      extraction.intensitas = [{ keyword: 'gatal', confidence: 'high' }];

      const result = transition(ctx, {
        type: 'EXTRACTION_RECEIVED',
        extraction,
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.context.categoriesCovered).toEqual(['intensitas']);
      }
    });

    it('ignores low-confidence only keywords for coverage', () => {
      const ctx = makeChatContext();
      const extraction = makeEmptyExtraction();
      extraction.lesi = [{ keyword: 'bintik', confidence: 'low' }];

      const result = transition(ctx, {
        type: 'EXTRACTION_RECEIVED',
        extraction,
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.context.categoriesCovered).toEqual([]);
      }
    });

    it('returns error from PRE_CHAT state', () => {
      const ctx = makeChatContext({ state: 'PRE_CHAT' });
      const result = transition(ctx, {
        type: 'EXTRACTION_RECEIVED',
        extraction: makeEmptyExtraction(),
      });

      expect(isTransitionError(result)).toBe(true);
    });
  });

  describe('LOW_CONFIDENCE', () => {
    it('transitions CHATTING → FOLLOW_UP with target category', () => {
      const ctx = makeChatContext();
      const result = transition(ctx, {
        type: 'LOW_CONFIDENCE',
        category: 'intensitas',
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('FOLLOW_UP');
        expect(result.context.followUpTarget).toBe('intensitas');
        expect(result.context.categoriesFollowedUp).toContain('intensitas');
      }
    });

    it('does not duplicate category in categoriesFollowedUp', () => {
      const ctx = makeChatContext({
        categoriesFollowedUp: ['intensitas'],
      });
      const result = transition(ctx, {
        type: 'LOW_CONFIDENCE',
        category: 'intensitas',
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.context.categoriesFollowedUp).toEqual(['intensitas']);
      }
    });

    it('returns error from FOLLOW_UP state', () => {
      const ctx = makeChatContext({ state: 'FOLLOW_UP' });
      const result = transition(ctx, {
        type: 'LOW_CONFIDENCE',
        category: 'waktu',
      });

      expect(isTransitionError(result)).toBe(true);
    });
  });

  describe('FOLLOW_UP_RESPONSE', () => {
    it('transitions FOLLOW_UP → CHATTING and marks category covered', () => {
      const ctx = makeChatContext({
        state: 'FOLLOW_UP',
        followUpTarget: 'intensitas',
      });
      const result = transition(ctx, {
        type: 'FOLLOW_UP_RESPONSE',
        category: 'intensitas',
        extraction: makeEmptyExtraction(),
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('CHATTING');
        expect(result.context.followUpTarget).toBeNull();
        expect(result.context.categoriesCovered).toContain('intensitas');
        expect(result.context.turn).toBe(2);
      }
    });

    it('does not duplicate already-covered category', () => {
      const ctx = makeChatContext({
        state: 'FOLLOW_UP',
        followUpTarget: 'intensitas',
        categoriesCovered: ['intensitas'],
      });
      const result = transition(ctx, {
        type: 'FOLLOW_UP_RESPONSE',
        category: 'intensitas',
        extraction: makeEmptyExtraction(),
      });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.context.categoriesCovered).toEqual(['intensitas']);
      }
    });

    it('returns error from CHATTING state', () => {
      const ctx = makeChatContext({ state: 'CHATTING' });
      const result = transition(ctx, {
        type: 'FOLLOW_UP_RESPONSE',
        category: 'intensitas',
        extraction: makeEmptyExtraction(),
      });

      expect(isTransitionError(result)).toBe(true);
    });
  });

  describe('ALL_CATEGORIES_COVERED', () => {
    it('transitions CHATTING → COMPLETED', () => {
      const ctx = makeChatContext();
      const result = transition(ctx, { type: 'ALL_CATEGORIES_COVERED' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('COMPLETED');
        expect(result.context.state).toBe('COMPLETED');
      }
    });

    it('returns error from FOLLOW_UP state', () => {
      const ctx = makeChatContext({ state: 'FOLLOW_UP' });
      const result = transition(ctx, { type: 'ALL_CATEGORIES_COVERED' });

      expect(isTransitionError(result)).toBe(true);
    });
  });

  describe('FORCE_CLOSE', () => {
    it('transitions CHATTING → COMPLETED', () => {
      const ctx = makeChatContext({ state: 'CHATTING' });
      const result = transition(ctx, { type: 'FORCE_CLOSE' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('COMPLETED');
      }
    });

    it('transitions FOLLOW_UP → COMPLETED and clears followUpTarget', () => {
      const ctx = makeChatContext({
        state: 'FOLLOW_UP',
        followUpTarget: 'waktu',
      });
      const result = transition(ctx, { type: 'FORCE_CLOSE' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('COMPLETED');
        expect(result.context.followUpTarget).toBeNull();
      }
    });

    it('returns error from PRE_CHAT state', () => {
      const ctx = makeChatContext({ state: 'PRE_CHAT' });
      const result = transition(ctx, { type: 'FORCE_CLOSE' });

      expect(isTransitionError(result)).toBe(true);
    });

    it('returns error from COMPLETED state', () => {
      const ctx = makeChatContext({ state: 'COMPLETED' });
      const result = transition(ctx, { type: 'FORCE_CLOSE' });

      expect(isTransitionError(result)).toBe(true);
    });

    it('returns error from TERMINATED state', () => {
      const ctx = makeChatContext({ state: 'TERMINATED' });
      const result = transition(ctx, { type: 'FORCE_CLOSE' });

      expect(isTransitionError(result)).toBe(true);
    });
  });

  describe('CRISIS_DETECTED', () => {
    it('transitions CHATTING → TERMINATED', () => {
      const ctx = makeChatContext({ state: 'CHATTING' });
      const result = transition(ctx, { type: 'CRISIS_DETECTED' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('TERMINATED');
        expect(result.context.state).toBe('TERMINATED');
      }
    });

    it('transitions FOLLOW_UP → TERMINATED and clears followUpTarget', () => {
      const ctx = makeChatContext({
        state: 'FOLLOW_UP',
        followUpTarget: 'lesi',
      });
      const result = transition(ctx, { type: 'CRISIS_DETECTED' });

      expect(isTransitionResult(result)).toBe(true);
      if (isTransitionResult(result)) {
        expect(result.newState).toBe('TERMINATED');
        expect(result.context.followUpTarget).toBeNull();
      }
    });

    it('returns error from PRE_CHAT state', () => {
      const ctx = makeChatContext({ state: 'PRE_CHAT' });
      const result = transition(ctx, { type: 'CRISIS_DETECTED' });

      expect(isTransitionError(result)).toBe(true);
    });

    it('returns error from COMPLETED state', () => {
      const ctx = makeChatContext({ state: 'COMPLETED' });
      const result = transition(ctx, { type: 'CRISIS_DETECTED' });

      expect(isTransitionError(result)).toBe(true);
    });
  });
});

// ─── isTerminalState ───

describe('isTerminalState', () => {
  it('returns true for COMPLETED', () => {
    expect(isTerminalState('COMPLETED')).toBe(true);
  });

  it('returns true for TERMINATED', () => {
    expect(isTerminalState('TERMINATED')).toBe(true);
  });

  it('returns false for PRE_CHAT', () => {
    expect(isTerminalState('PRE_CHAT')).toBe(false);
  });

  it('returns false for CHATTING', () => {
    expect(isTerminalState('CHATTING')).toBe(false);
  });

  it('returns false for FOLLOW_UP', () => {
    expect(isTerminalState('FOLLOW_UP')).toBe(false);
  });
});
