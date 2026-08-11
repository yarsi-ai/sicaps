import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { transition } from './state-machine';
import type { SessionContext, SessionState, TransitionError, TransitionEvent } from '../types';
import type { CategoryExtraction } from '../keywords/types';

// ─── Helpers ───

const ALL_STATES: SessionState[] = ['PRE_CHAT', 'CHATTING', 'FOLLOW_UP', 'COMPLETED', 'TERMINATED'];

const ALL_EVENT_TYPES: TransitionEvent['type'][] = [
  'DEMOGRAPHICS_SUBMITTED',
  'EXTRACTION_RECEIVED',
  'LOW_CONFIDENCE',
  'FOLLOW_UP_RESPONSE',
  'ALL_CATEGORIES_COVERED',
  'FORCE_CLOSE',
  'CRISIS_DETECTED',
];

/**
 * Valid (state, event.type) pairs as defined by the state machine.
 * Any combination NOT in this set is an invalid transition.
 */
const VALID_TRANSITIONS: ReadonlySet<string> = new Set([
  'PRE_CHAT:DEMOGRAPHICS_SUBMITTED',
  'CHATTING:EXTRACTION_RECEIVED',
  'CHATTING:LOW_CONFIDENCE',
  'CHATTING:ALL_CATEGORIES_COVERED',
  'CHATTING:FORCE_CLOSE',
  'CHATTING:CRISIS_DETECTED',
  'FOLLOW_UP:FOLLOW_UP_RESPONSE',
  'FOLLOW_UP:FORCE_CLOSE',
  'FOLLOW_UP:CRISIS_DETECTED',
]);

function isValidTransition(state: SessionState, eventType: TransitionEvent['type']): boolean {
  return VALID_TRANSITIONS.has(`${state}:${eventType}`);
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

function makeContextForState(state: SessionState): SessionContext {
  return {
    sessionId: 'prop-test-session',
    state,
    theme: 'hybrid',
    locale: 'id',
    turn: 2,
    categoriesCovered: ['intensitas'],
    categoriesFollowedUp: [],
    followUpTarget: state === 'FOLLOW_UP' ? 'waktu' : null,
    offTopicCount: 0,
    shortAnswerCount: 0,
  };
}

function isTransitionError(result: unknown): result is TransitionError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    (result as TransitionError).type === 'INVALID_TRANSITION'
  );
}

// ─── Arbitraries ───

const arbState = fc.constantFrom<SessionState>(...ALL_STATES);
const arbEventType = fc.constantFrom<TransitionEvent['type']>(...ALL_EVENT_TYPES);

const CATEGORIES = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
] as const;

const arbCategory = fc.constantFrom(...CATEGORIES);

/**
 * Builds a TransitionEvent from a given event type.
 * Events with payload get minimal valid payloads.
 */
function buildEvent(eventType: TransitionEvent['type']): fc.Arbitrary<TransitionEvent> {
  switch (eventType) {
    case 'DEMOGRAPHICS_SUBMITTED':
      return fc.constant({ type: 'DEMOGRAPHICS_SUBMITTED' } as TransitionEvent);
    case 'EXTRACTION_RECEIVED':
      return fc.constant({
        type: 'EXTRACTION_RECEIVED',
        extraction: makeEmptyExtraction(),
      } as TransitionEvent);
    case 'LOW_CONFIDENCE':
      return arbCategory.map(
        (cat) =>
          ({
            type: 'LOW_CONFIDENCE',
            category: cat,
          }) as TransitionEvent,
      );
    case 'FOLLOW_UP_RESPONSE':
      return arbCategory.map(
        (cat) =>
          ({
            type: 'FOLLOW_UP_RESPONSE',
            category: cat,
            extraction: makeEmptyExtraction(),
          }) as TransitionEvent,
      );
    case 'ALL_CATEGORIES_COVERED':
      return fc.constant({ type: 'ALL_CATEGORIES_COVERED' } as TransitionEvent);
    case 'FORCE_CLOSE':
      return fc.constant({ type: 'FORCE_CLOSE' } as TransitionEvent);
    case 'CRISIS_DETECTED':
      return fc.constant({ type: 'CRISIS_DETECTED' } as TransitionEvent);
  }
}

/**
 * Generates an invalid (state, event) pair — filtered to exclude valid transitions.
 */
const arbInvalidTransitionPair = fc
  .tuple(arbState, arbEventType)
  .filter(([state, eventType]) => !isValidTransition(state, eventType))
  .chain(([state, eventType]) => buildEvent(eventType).map((event) => ({ state, event })));

// ─── Property 15 ───

describe('Feature: ai-chat-bot, Property 15: State machine invalid transition rejection', () => {
  /**
   * Validates: Requirements 8.7
   *
   * For any (state, event) pair NOT in the valid transition set,
   * the transition function SHALL return a TransitionError and
   * the session context SHALL remain unchanged.
   */
  it('rejects all invalid (state, event) pairs with TransitionError', () => {
    fc.assert(
      fc.property(arbInvalidTransitionPair, ({ state, event }) => {
        const context = makeContextForState(state);
        const contextSnapshot = JSON.parse(JSON.stringify(context));

        const result = transition(context, event);

        // Must return a TransitionError
        expect(isTransitionError(result)).toBe(true);

        if (isTransitionError(result)) {
          expect(result.type).toBe('INVALID_TRANSITION');
          expect(result.from).toBe(state);
          expect(result.event).toBe(event.type);
          expect(result.message).toContain(state);
          expect(result.message).toContain(event.type);
        }

        // Original context must remain unchanged (no mutation)
        expect(context).toEqual(contextSnapshot);
      }),
      { numRuns: 100 },
    );
  });
});
