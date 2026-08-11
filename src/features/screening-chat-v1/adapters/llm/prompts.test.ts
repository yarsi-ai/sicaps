// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PROMPT_VERSION, buildSystemMessage, buildMessages, buildOutputMessages } from './prompts';
import type { SessionContext, OutputContext } from './prompts';

const baseSession: SessionContext = {
  theme: 'playful',
  locale: 'id',
  turn: 1,
  demographics: { age: 16, gender: 'male' },
  categoriesCovered: [],
  categoriesRemaining: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
};

const baseHistory: Array<{ role: 'assistant' | 'user'; content: string }> = [
  { role: 'assistant', content: 'Halo! Apa kabar?' },
  { role: 'user', content: 'Saya merasa gatal-gatal.' },
];

const baseOutputContext: OutputContext = {
  scores: { intensitas: 2, waktu: 1, lokasi_tubuh: 0, kontak: 1, lesi: 0, faktor_risiko: 1 },
  riskLevel: 'MODERATE',
  matchedKeywords: {
    intensitas: ['gatal', 'malam'],
    waktu: ['seminggu'],
    lokasi_tubuh: [],
    kontak: ['teman sekamar'],
    lesi: [],
    faktor_risiko: ['asrama'],
  },
  perception: null,
  locale: 'id',
  theme: 'playful',
};

describe('PROMPT_VERSION', () => {
  it('exports v1', () => {
    expect(PROMPT_VERSION).toBe('v1');
  });
});

describe('buildSystemMessage', () => {
  it('returns a string containing persona, session context, and backend instruction', () => {
    const result = buildSystemMessage(baseSession);

    expect(typeof result).toBe('string');
    // Should contain persona elements
    expect(result).toContain('SICAPS');
    // Should contain session context
    expect(result).toContain('16');
    expect(result).toContain('male');
    // Should contain backend instruction (JSON format)
    expect(result).toContain('JSON');
    expect(result).toContain('reply');
    expect(result).toContain('extraction');
  });

  it('separates sections with double newlines', () => {
    const result = buildSystemMessage(baseSession);
    const sections = result.split('\n\n');

    // At minimum 3 logical sections
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('respects locale=en', () => {
    const enSession: SessionContext = { ...baseSession, locale: 'en' };
    const result = buildSystemMessage(enSession);

    expect(result).toContain('English');
    expect(result).toContain('Session Context');
  });

  it('respects locale=id', () => {
    const result = buildSystemMessage(baseSession);

    expect(result).toContain('Indonesia');
    expect(result).toContain('Konteks Sesi');
  });

  it('respects theme=hybrid', () => {
    const hybridSession: SessionContext = { ...baseSession, theme: 'hybrid' };
    const result = buildSystemMessage(hybridSession);

    expect(result).toContain('profesional');
  });

  it('includes categories covered and remaining', () => {
    const session: SessionContext = {
      ...baseSession,
      categoriesCovered: ['intensitas', 'waktu'],
      categoriesRemaining: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    const result = buildSystemMessage(session);

    expect(result).toContain('intensitas');
    expect(result).toContain('waktu');
    expect(result).toContain('lokasi_tubuh');
  });

  it('throws on null session', () => {
    expect(() => buildSystemMessage(null as unknown as SessionContext)).toThrow(
      /session is required/,
    );
  });

  it('throws on undefined session', () => {
    expect(() => buildSystemMessage(undefined as unknown as SessionContext)).toThrow(
      /session is required/,
    );
  });
});

describe('buildMessages', () => {
  it('returns system message at index 0', () => {
    const messages = buildMessages(baseSession, [], 'Hello');

    expect(messages[0]!.role).toBe('system');
    expect(typeof messages[0]!.content).toBe('string');
  });

  it('returns user message as last element', () => {
    const messages = buildMessages(baseSession, baseHistory, 'Test message');
    const last = messages[messages.length - 1]!;

    expect(last.role).toBe('user');
    expect(last.content).toBe('Test message');
  });

  it('returns exactly 2 elements for empty history (system + user)', () => {
    const messages = buildMessages(baseSession, [], 'Hello');

    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  it('preserves history order between system and user message', () => {
    const messages = buildMessages(baseSession, baseHistory, 'New message');

    expect(messages).toHaveLength(4); // system + 2 history + user
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.content).toBe('Halo! Apa kabar?');
    expect(messages[2]!.role).toBe('user');
    expect(messages[2]!.content).toBe('Saya merasa gatal-gatal.');
    expect(messages[3]!.role).toBe('user');
    expect(messages[3]!.content).toBe('New message');
  });

  it('history assistant messages contain only reply text (not full JSON)', () => {
    const history = [
      { role: 'assistant' as const, content: 'This is just the reply text' },
      { role: 'user' as const, content: 'User says something' },
    ];
    const messages = buildMessages(baseSession, history, 'Next');

    // Assistant content should be exactly what was passed in (reply text only)
    expect(messages[1]!.content).toBe('This is just the reply text');
    expect(messages[1]!.content).not.toContain('"extraction"');
  });

  it('throws on null session', () => {
    expect(() => buildMessages(null as unknown as SessionContext, [], 'msg')).toThrow(
      /session is required/,
    );
  });

  it('throws on undefined session', () => {
    expect(() => buildMessages(undefined as unknown as SessionContext, [], 'msg')).toThrow(
      /session is required/,
    );
  });

  it('throws on null history', () => {
    expect(() =>
      buildMessages(
        baseSession,
        null as unknown as Array<{ role: 'assistant' | 'user'; content: string }>,
        'msg',
      ),
    ).toThrow(/history is required/);
  });

  it('throws on undefined history', () => {
    expect(() =>
      buildMessages(
        baseSession,
        undefined as unknown as Array<{ role: 'assistant' | 'user'; content: string }>,
        'msg',
      ),
    ).toThrow(/history is required/);
  });

  it('throws on null userMessage', () => {
    expect(() => buildMessages(baseSession, [], null as unknown as string)).toThrow(
      /userMessage is required/,
    );
  });

  it('throws on undefined userMessage', () => {
    expect(() => buildMessages(baseSession, [], undefined as unknown as string)).toThrow(
      /userMessage is required/,
    );
  });

  it('produces deterministic output for same inputs', () => {
    const result1 = buildMessages(baseSession, baseHistory, 'Test');
    const result2 = buildMessages(baseSession, baseHistory, 'Test');

    expect(result1).toEqual(result2);
  });
});

describe('buildOutputMessages', () => {
  it('returns system message at index 0 with screening data', () => {
    const messages = buildOutputMessages(baseOutputContext, baseHistory);

    expect(messages[0]!.role).toBe('system');
    const systemContent = messages[0]!.content as string;
    expect(systemContent).toContain('MODERATE');
    expect(systemContent).toContain('intensitas');
    expect(systemContent).toContain('conclusion');
    expect(systemContent).toContain('recommendation');
  });

  it('includes scores breakdown in system message', () => {
    const messages = buildOutputMessages(baseOutputContext, baseHistory);
    const systemContent = messages[0]!.content as string;

    expect(systemContent).toContain('intensitas: 2');
    expect(systemContent).toContain('waktu: 1');
    expect(systemContent).toContain('kontak: 1');
  });

  it('includes matched keywords in system message', () => {
    const messages = buildOutputMessages(baseOutputContext, baseHistory);
    const systemContent = messages[0]!.content as string;

    expect(systemContent).toContain('gatal');
    expect(systemContent).toContain('malam');
    expect(systemContent).toContain('seminggu');
    expect(systemContent).toContain('teman sekamar');
  });

  it('includes perception when present', () => {
    const contextWithPerception: OutputContext = {
      ...baseOutputContext,
      perception: 'UNDERESTIMATE',
    };
    const messages = buildOutputMessages(contextWithPerception, baseHistory);
    const systemContent = messages[0]!.content as string;

    expect(systemContent).toContain('UNDERESTIMATE');
  });

  it('handles null perception', () => {
    const messages = buildOutputMessages(baseOutputContext, baseHistory);
    const systemContent = messages[0]!.content as string;

    expect(systemContent).toContain('tidak terdeteksi');
  });

  it('includes history messages after system', () => {
    const messages = buildOutputMessages(baseOutputContext, baseHistory);

    expect(messages).toHaveLength(3); // system + 2 history
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.content).toBe('Halo! Apa kabar?');
    expect(messages[2]!.role).toBe('user');
    expect(messages[2]!.content).toBe('Saya merasa gatal-gatal.');
  });

  it('works with empty history', () => {
    const messages = buildOutputMessages(baseOutputContext, []);

    expect(messages).toHaveLength(1); // system only
    expect(messages[0]!.role).toBe('system');
  });

  it('respects locale=en', () => {
    const enContext: OutputContext = { ...baseOutputContext, locale: 'en' };
    const messages = buildOutputMessages(enContext, []);
    const systemContent = messages[0]!.content as string;

    expect(systemContent).toContain('Screening Data');
    expect(systemContent).toContain('Risk level');
    expect(systemContent).toContain('none detected');
  });

  it('throws on null context', () => {
    expect(() => buildOutputMessages(null as unknown as OutputContext, [])).toThrow(
      /context is required/,
    );
  });

  it('throws on undefined context', () => {
    expect(() => buildOutputMessages(undefined as unknown as OutputContext, [])).toThrow(
      /context is required/,
    );
  });

  it('throws on null history', () => {
    expect(() =>
      buildOutputMessages(
        baseOutputContext,
        null as unknown as Array<{ role: 'assistant' | 'user'; content: string }>,
      ),
    ).toThrow(/history is required/);
  });

  it('throws on undefined history', () => {
    expect(() =>
      buildOutputMessages(
        baseOutputContext,
        undefined as unknown as Array<{ role: 'assistant' | 'user'; content: string }>,
      ),
    ).toThrow(/history is required/);
  });

  it('produces deterministic output for same inputs', () => {
    const result1 = buildOutputMessages(baseOutputContext, baseHistory);
    const result2 = buildOutputMessages(baseOutputContext, baseHistory);

    expect(result1).toEqual(result2);
  });
});

// --- Arbitraries for property-based tests ---

const CATEGORIES = ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'];

const sessionContextArb: fc.Arbitrary<SessionContext> = fc.record({
  theme: fc.constantFrom<'playful' | 'hybrid'>('playful', 'hybrid'),
  locale: fc.constantFrom<'id' | 'en'>('id', 'en'),
  turn: fc.integer({ min: 1, max: 100 }),
  demographics: fc.record({
    age: fc.integer({ min: 1, max: 100 }),
    gender: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  categoriesCovered: fc.subarray(CATEGORIES, { minLength: 0 }),
  categoriesRemaining: fc.subarray(CATEGORIES, { minLength: 0 }),
});

const historyEntryArb = fc.record({
  role: fc.constantFrom<'assistant' | 'user'>('assistant', 'user'),
  content: fc.string({ minLength: 1, maxLength: 200 }),
});

const historyArb = fc.array(historyEntryArb, { minLength: 0, maxLength: 10 });

const userMessageArb = fc.string({ minLength: 1, maxLength: 500 });

describe('buildMessages property-based tests', () => {
  /**
   * **Validates: Requirements 6.7**
   * Property 4: Prompt builder produces deterministic output.
   * For any SessionContext, conversation history, and user message,
   * calling buildMessages with the same inputs always produces a deep-equal messages array.
   */
  it('P4: produces deterministic output for same inputs', () => {
    fc.assert(
      fc.property(
        sessionContextArb,
        historyArb,
        userMessageArb,
        (session, history, userMessage) => {
          const result1 = buildMessages(session, history, userMessage);
          const result2 = buildMessages(session, history, userMessage);

          expect(result1).toEqual(result2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('buildMessages property-based tests — message ordering', () => {
  const nonEmptyHistoryArb = fc.array(historyEntryArb, { minLength: 1, maxLength: 10 });

  /**
   * **Validates: Requirements 6.2**
   * Property 5: Prompt builder message ordering invariant.
   * For any SessionContext and non-empty conversation history,
   * the messages array from buildMessages SHALL have the system message
   * at index 0 and the user message as the last element.
   */
  it('P5: system message at index 0 and user message as last element', () => {
    fc.assert(
      fc.property(
        sessionContextArb,
        nonEmptyHistoryArb,
        userMessageArb,
        (session, history, userMessage) => {
          const messages = buildMessages(session, history, userMessage);

          // System message is always first
          expect(messages[0]!.role).toBe('system');

          // User message is always last, with matching content
          const last = messages[messages.length - 1]!;
          expect(last.role).toBe('user');
          expect(last.content).toBe(userMessage);
        },
      ),
      { numRuns: 100 },
    );
  });
});
