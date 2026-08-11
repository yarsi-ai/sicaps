/**
 * Locale behaviour of the compose prompt builders.
 *
 * Separate from instruction.test.ts, which pins the Indonesian wording; this
 * file asserts that an English session produces English prompts and never
 * leaks Indonesian instruction text.
 */

import { describe, it, expect } from 'vitest';

import {
  buildCollectingPrompt,
  buildComposePrompt,
  buildFollowUpPrompt,
  buildPerceptionPrompt,
  buildWarmupPrompt,
  getLanguageRule,
  getPronounRule,
  getPromptHeadings,
  getPromptLabels,
  DEFAULT_SCORING_STATE,
} from './instruction';
import type { SessionSummary } from './checkpoint';
import type { InstructionContext, SessionPhase } from '../types';

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

const checkpoint: SessionSummary = {
  perception: 'ADEQUATE',
  emosi: null,
  perDimension: { intensitas: { keywords: ['severe'], negasi: [] } },
  riskLevel: 'MODERATE',
  totalScore: 4,
} as unknown as SessionSummary;

/** Instruction words that only appear in the Indonesian prompt scaffolding. */
const INDONESIAN_MARKERS = ['DILARANG', 'ATURAN UTAMA', 'CARA MERESPONS', 'Kamu adalah SICAPS'];

const ALL_PHASES: SessionPhase[] = [
  'GREETING',
  'COLLECTING',
  'ASKING_PERCEPTION',
  'OFFERING_RESULT',
  'SCREENING_COMPLETE',
  'FOLLOW_UP',
  'CLOSED',
];

describe('getLanguageRule', () => {
  it('demands Indonesian output for id', () => {
    expect(getLanguageRule('id')).toMatch(/Bahasa Indonesia/);
  });

  it('demands English output for en', () => {
    expect(getLanguageRule('en')).toMatch(/reply in English/i);
  });
});

describe('getPronounRule', () => {
  it('returns Indonesian pronoun guidance for id', () => {
    expect(getPronounRule('id')).toContain('"kamu"');
  });

  it('returns English pronoun guidance for en', () => {
    expect(getPronounRule('en')).toContain('"you"');
  });
});

describe('getPromptHeadings', () => {
  it('returns Indonesian headings for id', () => {
    expect(getPromptHeadings('id').mainRules).toBe('--- ATURAN UTAMA ---');
  });

  it('returns English headings for en', () => {
    expect(getPromptHeadings('en').mainRules).toBe('--- CORE RULES ---');
  });
});

describe('getPromptLabels', () => {
  it('returns Indonesian labels for id', () => {
    expect(getPromptLabels('id').riskLevel).toBe('Tingkat risiko');
  });

  it('returns English labels for en', () => {
    expect(getPromptLabels('en').riskLevel).toBe('Risk level');
  });
});

describe('buildComposePrompt with locale en', () => {
  for (const phase of ALL_PHASES) {
    it(`produces an English prompt for ${phase}`, () => {
      const result = buildComposePrompt(phase, makeContext({ phase, locale: 'en' }));

      expect(result).toContain('You are SICAPS');
      expect(result).toContain('--- CORE RULES ---');
      expect(result).toMatch(/reply in English/i);
    });

    it(`leaks no Indonesian instruction text for ${phase}`, () => {
      const result = buildComposePrompt(phase, makeContext({ phase, locale: 'en' }));

      for (const marker of INDONESIAN_MARKERS) {
        expect(result).not.toContain(marker);
      }
    });
  }

  it('still produces Indonesian prompts for locale id', () => {
    const result = buildComposePrompt('COLLECTING', makeContext({ locale: 'id' }));

    expect(result).toContain('Kamu adalah SICAPS');
    expect(result).toContain('--- ATURAN UTAMA ---');
  });
});

describe('buildCollectingPrompt', () => {
  it('lists English target hints for en', () => {
    const result = buildCollectingPrompt(makeContext({ locale: 'en' }));

    expect(result).toContain('--- ALLOWED QUESTION TOPICS ---');
    expect(result).toContain('Ask how severe the itching is');
  });

  it('appends the English nudge note when shouldNudge is set', () => {
    const result = buildCollectingPrompt(makeContext({ locale: 'en', shouldNudge: true }));

    expect(result).toContain('--- ADDITIONAL NOTE ---');
    expect(result).toContain('wrapping up the screening');
  });

  it('omits the nudge note when shouldNudge is false', () => {
    const result = buildCollectingPrompt(makeContext({ locale: 'en', shouldNudge: false }));

    expect(result).not.toContain('--- ADDITIONAL NOTE ---');
  });

  it('uses the chips-pending variant in English when no composable dimension remains', () => {
    const result = buildCollectingPrompt(
      makeContext({ locale: 'en', dimensiBelum: ['kontak', 'lokasi_tubuh', 'faktor_risiko'] }),
    );

    expect(result).toContain('short follow-up questions');
    expect(result).not.toContain('--- ALLOWED QUESTION TOPICS ---');
  });
});

describe('buildPerceptionPrompt', () => {
  it('offers the three severity options in English', () => {
    const result = buildPerceptionPrompt('en');

    expect(result).toContain('no big deal');
    expect(result).toContain('really worrying');
  });

  it('defaults to Indonesian when no locale is given', () => {
    expect(buildPerceptionPrompt()).toContain('Kamu adalah SICAPS');
  });
});

describe('buildWarmupPrompt', () => {
  it('returns English warmup guidance for en', () => {
    const result = buildWarmupPrompt('en');

    expect(result).toContain('You are SICAPS');
    expect(result).toMatch(/reply in English/i);
  });

  it('defaults to Indonesian when no locale is given', () => {
    expect(buildWarmupPrompt()).toContain('Kamu adalah SICAPS');
  });
});

describe('buildFollowUpPrompt', () => {
  it('labels the session context in English for en', () => {
    const result = buildFollowUpPrompt(checkpoint, 'en');

    expect(result).toContain('--- SESSION CONTEXT ---');
    expect(result).toContain('Risk level: MODERATE');
  });

  it('includes the context note under the English label', () => {
    const result = buildFollowUpPrompt(checkpoint, 'en', 'User worried about contagion');

    expect(result).toContain('Note: User worried about contagion');
  });

  it('renders the not-detected placeholder in English when emotion is absent', () => {
    const result = buildFollowUpPrompt(checkpoint, 'en');

    expect(result).toContain('Emotion: not detected');
  });
});
