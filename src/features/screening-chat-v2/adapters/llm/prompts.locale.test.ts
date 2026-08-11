/**
 * Locale behaviour of the LLM prompt builders.
 *
 * Complements prompts.test.ts (which pins Indonesian wording) by asserting the
 * English session path: English compose scaffolding, an English extraction
 * knowledge base, and English education points.
 */

import { describe, it, expect } from 'vitest';

import { buildComposeMessages, buildExtractMessages } from './prompts';
import { DEFAULT_SCORING_STATE } from '../../domain/chat/instruction';
import { getPromptKeywordList } from '../../domain/keywords/prompt-keywords';
import { getEdukasiPoints } from '../../domain/chat/bot-text';
import type { InstructionContext } from '../../domain/types';

function makeContext(overrides: Partial<InstructionContext> = {}): InstructionContext {
  return {
    phase: 'COLLECTING',
    dimensiTerisi: {},
    dimensiBelum: ['intensitas', 'waktu', 'lesi'],
    turnCount: 2,
    locale: 'en',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
    perception: null,
    ...overrides,
  };
}

describe('buildComposeMessages locale handling', () => {
  it('uses the English anti-leak block for en', () => {
    const [system] = buildComposeMessages('COLLECTING', makeContext({ locale: 'en' }), []);

    expect(system!.content).toContain('--- IMPORTANT ---');
    expect(system!.content).toContain('OUTPUT ONLY the chat text');
  });

  it('uses the Indonesian anti-leak block for id', () => {
    const [system] = buildComposeMessages('COLLECTING', makeContext({ locale: 'id' }), []);

    expect(system!.content).toContain('--- PENTING ---');
    expect(system!.content).toContain('OUTPUT HANYA teks chat');
  });

  it('injects English education points during SCREENING_COMPLETE', () => {
    const [system] = buildComposeMessages(
      'SCREENING_COMPLETE',
      makeContext({
        locale: 'en',
        phase: 'SCREENING_COMPLETE',
        scoringState: { ...DEFAULT_SCORING_STATE, gatalMalam: true, kontakSerupa: true },
      }),
      [],
    );

    expect(system!.content).toContain('--- MANDATORY EDUCATION ---');
    expect(system!.content).toContain('Detected risk: HIGH');
    for (const point of getEdukasiPoints('HIGH', 'en')) {
      expect(system!.content).toContain(point);
    }
  });

  it('numbers the education points it injects', () => {
    const [system] = buildComposeMessages(
      'SCREENING_COMPLETE',
      makeContext({
        locale: 'en',
        phase: 'SCREENING_COMPLETE',
        scoringState: { ...DEFAULT_SCORING_STATE, gatalMalam: true, kontakSerupa: true },
      }),
      [],
    );

    expect(system!.content).toContain(`1. ${getEdukasiPoints('HIGH', 'en')[0]}`);
  });

  it('renders English perception guidance', () => {
    const [system] = buildComposeMessages(
      'SCREENING_COMPLETE',
      makeContext({ locale: 'en', phase: 'SCREENING_COMPLETE', perception: 'BARRIER' }),
      [],
    );

    expect(system!.content).toContain('--- PERCEPTION RESPONSE ---');
    expect(system!.content).toContain('User perception: THERE ARE BARRIERS');
  });

  it('appends chat history after the system message', () => {
    const messages = buildComposeMessages('COLLECTING', makeContext({ locale: 'en' }), [
      { role: 'user', content: 'itchy at night' },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ role: 'user', content: 'itchy at night' });
  });
});

describe('buildExtractMessages locale handling', () => {
  it('builds an English extraction prompt for en', () => {
    const [system] = buildExtractMessages(makeContext({ locale: 'en' }), []);

    expect(system!.content).toContain('clinical extraction module');
    expect(system!.content).toContain('--- KNOWLEDGE BASE: DIMENSIONS & KEYWORDS ---');
    expect(system!.content).toContain('Dimensions not yet filled: intensitas, waktu, lesi');
  });

  it('offers only English keywords for en', () => {
    const [system] = buildExtractMessages(makeContext({ locale: 'en' }), []);
    const bodyParts = getPromptKeywordList('en').lokasi_tubuh ?? [];

    expect(bodyParts.length).toBeGreaterThan(0);
    for (const keyword of bodyParts) {
      expect(system!.content).toContain(keyword);
    }
    expect(system!.content).not.toContain('sela jari, jari tangan');
  });

  it('offers only Indonesian keywords for id', () => {
    const [system] = buildExtractMessages(makeContext({ locale: 'id' }), []);

    expect(system!.content).toContain('sela jari, jari tangan, pergelangan');
    expect(system!.content).not.toContain('between fingers');
  });

  it('renders every prompt keyword for the locale', () => {
    for (const locale of ['id', 'en'] as const) {
      const [system] = buildExtractMessages(makeContext({ locale }), []);
      const list = getPromptKeywordList(locale);

      for (const keywords of Object.values(list)) {
        for (const keyword of keywords) {
          expect(system!.content).toContain(keyword);
        }
      }
    }
  });

  it('keeps the emosi enum values in Indonesian for both locales', () => {
    for (const locale of ['id', 'en'] as const) {
      const [system] = buildExtractMessages(makeContext({ locale }), []);

      expect(system!.content).toContain('"ingin_sembuh"');
    }
  });

  it('reports filled dimensions using the English label for en', () => {
    const [system] = buildExtractMessages(
      makeContext({
        locale: 'en',
        dimensiTerisi: { intensitas: { keywords: ['severe'], negasi: [] } },
      }),
      [],
    );

    expect(system!.content).toContain('Dimensions already filled:');
    expect(system!.content).toContain('intensitas: severe');
  });

  it('marks an empty state with the English placeholder for en', () => {
    const [system] = buildExtractMessages(makeContext({ locale: 'en' }), []);

    expect(system!.content).toContain('Dimensions already filled: (none yet)');
  });
});
