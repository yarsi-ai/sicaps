import { describe, it, expect } from 'vitest';
import { detectEdgeCase } from './edge-cases';
import type { CategoryExtraction } from '../keywords/types';
import type { SessionContext } from '../types';

function makeContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'test-session',
    state: 'CHATTING',
    theme: 'hybrid',
    locale: 'id',
    turn: 2,
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

function makeExtractionWithKeywords(
  category: keyof CategoryExtraction,
  confidence: 'high' | 'medium' | 'low' = 'medium',
): CategoryExtraction {
  return {
    ...makeEmptyExtraction(),
    [category]: [{ keyword: 'gatal', confidence }],
  };
}

describe('detectEdgeCase', () => {
  describe('long message detection (>100 words)', () => {
    it('returns long_message for messages exceeding 100 words', () => {
      const longMessage = Array(101).fill('kata').join(' ');
      const result = detectEdgeCase(longMessage, null, makeContext());

      expect(result.type).toBe('long_message');
      expect(result.instruction).toEqual({
        type: 'LONG_MESSAGE_CONFIRM',
        targetCategory: null,
        isFollowUp: false,
      });
    });

    it('does not trigger for exactly 100 words', () => {
      const message = Array(100).fill('kata').join(' ');
      const result = detectEdgeCase(message, null, makeContext());

      expect(result.type).not.toBe('long_message');
    });

    it('takes priority over short answer and off-topic', () => {
      // 101 words — would also be "off-topic" if extraction is null
      const longMessage = Array(101).fill('random').join(' ');
      const result = detectEdgeCase(longMessage, null, makeContext());

      expect(result.type).toBe('long_message');
    });

    it('counts words by whitespace splitting', () => {
      const message = Array(101).fill('word').join('  '); // double spaces
      const result = detectEdgeCase(message, null, makeContext());

      expect(result.type).toBe('long_message');
    });
  });

  describe('short answer detection (≤2 words, no medium/high extraction)', () => {
    it('returns short_answer for single word with no extraction', () => {
      const result = detectEdgeCase('ya', null, makeContext());

      expect(result.type).toBe('short_answer');
      expect(result.instruction).toBeDefined();
      expect(result.instruction!.type).toBe('SHORT_ANSWER_FOLLOW_UP');
    });

    it('returns short_answer for two words with empty extraction', () => {
      const result = detectEdgeCase('iya gatal', makeEmptyExtraction(), makeContext());

      expect(result.type).toBe('short_answer');
      expect(result.instruction!.type).toBe('SHORT_ANSWER_FOLLOW_UP');
    });

    it('returns short_answer for single word with only low-confidence extraction', () => {
      const extraction = makeExtractionWithKeywords('intensitas', 'low');
      const result = detectEdgeCase('gatal', extraction, makeContext());

      expect(result.type).toBe('short_answer');
    });

    it('does not trigger when extraction has medium confidence', () => {
      const extraction = makeExtractionWithKeywords('intensitas', 'medium');
      const result = detectEdgeCase('ya', extraction, makeContext());

      expect(result.type).not.toBe('short_answer');
    });

    it('does not trigger when extraction has high confidence', () => {
      const extraction = makeExtractionWithKeywords('waktu', 'high');
      const result = detectEdgeCase('ya', extraction, makeContext());

      expect(result.type).not.toBe('short_answer');
    });

    it('does not trigger for messages with more than 2 words', () => {
      const result = detectEdgeCase('saya gatal sekali', null, makeContext());

      expect(result.type).not.toBe('short_answer');
    });

    it('targets followUpTarget category when set', () => {
      const context = makeContext({ followUpTarget: 'waktu' });
      const result = detectEdgeCase('ya', null, context);

      expect(result.type).toBe('short_answer');
      expect(result.instruction!.targetCategory).toBe('waktu');
    });

    it('targets first uncovered category when followUpTarget is null', () => {
      const context = makeContext({
        categoriesCovered: ['intensitas'],
        followUpTarget: null,
      });
      const result = detectEdgeCase('ok', null, context);

      expect(result.type).toBe('short_answer');
      expect(result.instruction!.targetCategory).toBe('waktu');
    });

    it('targets first default category when nothing is covered', () => {
      const result = detectEdgeCase('ya', null, makeContext());

      expect(result.instruction!.targetCategory).toBe('intensitas');
    });

    it('returns shouldAdvance true on second consecutive short answer', () => {
      const context = makeContext({ shortAnswerCount: 1 });
      const result = detectEdgeCase('ok', null, context);

      expect(result.type).toBe('short_answer');
      expect(result.shouldAdvance).toBe(true);
      expect(result.instruction).toBeUndefined();
    });

    it('returns instruction (not shouldAdvance) on first short answer', () => {
      const context = makeContext({ shortAnswerCount: 0 });
      const result = detectEdgeCase('ya', null, context);

      expect(result.type).toBe('short_answer');
      expect(result.shouldAdvance).toBeUndefined();
      expect(result.instruction).toBeDefined();
    });

    it('handles empty string as short answer', () => {
      const result = detectEdgeCase('', null, makeContext());

      expect(result.type).toBe('short_answer');
    });

    it('handles whitespace-only as short answer (0 words)', () => {
      const result = detectEdgeCase('   ', null, makeContext());

      expect(result.type).toBe('short_answer');
    });
  });

  describe('off-topic detection (zero keywords across all categories)', () => {
    it('returns off_topic when extraction is null and message is >2 words', () => {
      const result = detectEdgeCase('what is the weather today', null, makeContext());

      expect(result.type).toBe('off_topic');
      expect(result.instruction!.type).toBe('REDIRECT_ON_TOPIC');
    });

    it('returns off_topic when all extraction categories are empty and message >2 words', () => {
      const result = detectEdgeCase('saya suka main bola', makeEmptyExtraction(), makeContext());

      expect(result.type).toBe('off_topic');
      expect(result.instruction!.type).toBe('REDIRECT_ON_TOPIC');
    });

    it('returns REDIRECT_ON_TOPIC with current target category', () => {
      const context = makeContext({ followUpTarget: 'lesi' });
      const result = detectEdgeCase('apa kabar semua hari ini', makeEmptyExtraction(), context);

      expect(result.instruction!.type).toBe('REDIRECT_ON_TOPIC');
      expect(result.instruction!.targetCategory).toBe('lesi');
    });

    it('uses first uncovered category when no followUpTarget', () => {
      const context = makeContext({
        categoriesCovered: ['intensitas', 'waktu'],
        followUpTarget: null,
      });
      const result = detectEdgeCase(
        'cerita tentang cuaca hari ini',
        makeEmptyExtraction(),
        context,
      );

      expect(result.instruction!.targetCategory).toBe('lokasi_tubuh');
    });

    it('returns SESSION_CLOSE_OFFER on 3rd consecutive off-topic (offTopicCount=2)', () => {
      const context = makeContext({ offTopicCount: 2 });
      const result = detectEdgeCase('saya mau cerita tentang film', makeEmptyExtraction(), context);

      expect(result.type).toBe('off_topic');
      expect(result.instruction!.type).toBe('SESSION_CLOSE_OFFER');
      expect(result.instruction!.targetCategory).toBeNull();
    });

    it('returns SESSION_CLOSE_OFFER when offTopicCount exceeds 2', () => {
      const context = makeContext({ offTopicCount: 5 });
      const result = detectEdgeCase('masih bicara hal lain ya', makeEmptyExtraction(), context);

      expect(result.type).toBe('off_topic');
      expect(result.instruction!.type).toBe('SESSION_CLOSE_OFFER');
    });

    it('does not trigger off-topic when extraction has keywords (even low confidence)', () => {
      const extraction = makeExtractionWithKeywords('kontak', 'low');
      const result = detectEdgeCase('mungkin ada kontak sama teman', extraction, makeContext());

      expect(result.type).not.toBe('off_topic');
    });
  });

  describe('normal case (no edge case)', () => {
    it('returns normal when message is moderate length with extraction', () => {
      const extraction = makeExtractionWithKeywords('intensitas', 'medium');
      const result = detectEdgeCase(
        'kulit saya gatal sekali terutama di malam hari',
        extraction,
        makeContext(),
      );

      expect(result.type).toBe('normal');
      expect(result.instruction).toBeUndefined();
      expect(result.shouldAdvance).toBeUndefined();
    });

    it('returns normal for moderate length with low confidence keywords', () => {
      // >2 words, has keywords (not zero), but only low confidence
      // This doesn't trigger short answer (>2 words) or off-topic (has keywords)
      const extraction = makeExtractionWithKeywords('intensitas', 'low');
      const result = detectEdgeCase('mungkin sedikit gatal di tangan', extraction, makeContext());

      expect(result.type).toBe('normal');
    });
  });

  describe('priority ordering', () => {
    it('long message takes priority over everything', () => {
      // Long message (>100 words) that also has no extraction (would be off-topic)
      const longMessage = Array(101).fill('random').join(' ');
      const result = detectEdgeCase(longMessage, null, makeContext());

      expect(result.type).toBe('long_message');
    });

    it('short answer takes priority over off-topic', () => {
      // ≤2 words with null extraction → triggers both short answer and off-topic checks
      // Short answer should win because it comes first in priority
      const result = detectEdgeCase('ok', null, makeContext());

      expect(result.type).toBe('short_answer');
    });
  });
});
