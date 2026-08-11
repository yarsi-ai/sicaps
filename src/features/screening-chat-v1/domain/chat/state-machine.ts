import { SCORING_CONFIG, type SupportedLocale } from '../config';
import { ValidationError } from '@/lib/errors';
import type { CategoryName } from '../keywords/types';
import { selectTheme } from './persona';
import type {
  EducationLevelInput,
  SessionContext,
  SessionState,
  TransitionError,
  TransitionEvent,
  TransitionResult,
} from '../types';

const SUPPORTED_LOCALES = SCORING_CONFIG.i18n.SUPPORTED_LOCALES;

/**
 * Creates the initial session context for a new screening session.
 * Validates locale (must be 'id' or 'en') and defaults theme via selectTheme.
 *
 * @throws ValidationError if sessionId is missing or locale is unsupported
 */
export function createInitialContext(
  sessionId: string,
  locale: SupportedLocale,
  educationLevel: EducationLevelInput | undefined,
): SessionContext {
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }

  if (!locale || !SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    throw new ValidationError(
      `Unsupported locale: "${locale}". Supported locales: ${SUPPORTED_LOCALES.join(', ')}`,
    );
  }

  const theme = selectTheme(educationLevel);

  return {
    sessionId,
    state: 'PRE_CHAT',
    theme,
    locale,
    turn: 0,
    categoriesCovered: [],
    categoriesFollowedUp: [],
    followUpTarget: null,
    offTopicCount: 0,
    shortAnswerCount: 0,
  };
}

/**
 * Performs a state transition given the current context and an event.
 * Returns a TransitionResult on valid transitions, or a TransitionError for invalid ones.
 *
 * Invalid transitions return an error object — only precondition violations throw.
 */
export function transition(
  context: SessionContext,
  event: TransitionEvent,
): TransitionResult | TransitionError {
  const { state } = context;

  switch (event.type) {
    case 'DEMOGRAPHICS_SUBMITTED':
      if (state !== 'PRE_CHAT') {
        return invalidTransition(state, event.type);
      }
      return {
        newState: 'CHATTING',
        context: { ...context, state: 'CHATTING' },
      };

    case 'EXTRACTION_RECEIVED':
      if (state !== 'CHATTING') {
        return invalidTransition(state, event.type);
      }
      return handleExtractionReceived(context, event.extraction);

    case 'LOW_CONFIDENCE':
      if (state !== 'CHATTING') {
        return invalidTransition(state, event.type);
      }
      return handleLowConfidence(context, event.category);

    case 'FOLLOW_UP_RESPONSE':
      if (state !== 'FOLLOW_UP') {
        return invalidTransition(state, event.type);
      }
      return handleFollowUpResponse(context, event.category);

    case 'ALL_CATEGORIES_COVERED':
      if (state !== 'CHATTING') {
        return invalidTransition(state, event.type);
      }
      return {
        newState: 'COMPLETED',
        context: { ...context, state: 'COMPLETED' },
      };

    case 'FORCE_CLOSE':
      if (state !== 'CHATTING' && state !== 'FOLLOW_UP') {
        return invalidTransition(state, event.type);
      }
      return {
        newState: 'COMPLETED',
        context: { ...context, state: 'COMPLETED', followUpTarget: null },
      };

    case 'CRISIS_DETECTED':
      if (state !== 'CHATTING' && state !== 'FOLLOW_UP') {
        return invalidTransition(state, event.type);
      }
      return {
        newState: 'TERMINATED',
        context: { ...context, state: 'TERMINATED', followUpTarget: null },
      };

    default:
      return invalidTransition(state, (event as TransitionEvent).type);
  }
}

/**
 * Returns true if the given state is terminal (no further transitions possible).
 */
export function isTerminalState(state: SessionState): boolean {
  return state === 'COMPLETED' || state === 'TERMINATED';
}

// ─── Internal helpers ───

function invalidTransition(
  from: SessionState,
  eventType: TransitionEvent['type'],
): TransitionError {
  return {
    type: 'INVALID_TRANSITION',
    from,
    event: eventType,
    message: `Cannot transition from ${from} on event ${eventType}`,
  };
}

function handleExtractionReceived(
  context: SessionContext,
  extraction: Record<CategoryName, { keyword: string; confidence: string }[]>,
): TransitionResult {
  const newCategoriesCovered = [...context.categoriesCovered];

  for (const category of SCORING_CONFIG.categories) {
    if (newCategoriesCovered.includes(category)) continue;

    const keywords = extraction[category];
    if (!keywords || keywords.length === 0) continue;

    const hasMediumOrHigh = keywords.some(
      (kw) => kw.confidence === 'medium' || kw.confidence === 'high',
    );
    if (hasMediumOrHigh) {
      newCategoriesCovered.push(category);
    }
  }

  return {
    newState: 'CHATTING',
    context: {
      ...context,
      state: 'CHATTING',
      turn: context.turn + 1,
      categoriesCovered: newCategoriesCovered,
    },
  };
}

function handleLowConfidence(context: SessionContext, category: CategoryName): TransitionResult {
  return {
    newState: 'FOLLOW_UP',
    context: {
      ...context,
      state: 'FOLLOW_UP',
      followUpTarget: category,
      categoriesFollowedUp: context.categoriesFollowedUp.includes(category)
        ? context.categoriesFollowedUp
        : [...context.categoriesFollowedUp, category],
    },
  };
}

function handleFollowUpResponse(context: SessionContext, category: CategoryName): TransitionResult {
  const newCategoriesCovered = context.categoriesCovered.includes(category)
    ? context.categoriesCovered
    : [...context.categoriesCovered, category];

  return {
    newState: 'CHATTING',
    context: {
      ...context,
      state: 'CHATTING',
      turn: context.turn + 1,
      followUpTarget: null,
      categoriesCovered: newCategoriesCovered,
    },
  };
}
