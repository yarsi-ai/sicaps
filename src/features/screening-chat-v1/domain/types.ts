import type { CategoryName, Confidence, CategoryExtraction } from './keywords/types';
import type { RiskLevel, SupportedLocale } from './config';

// ─── State Machine ───

export type SessionState = 'PRE_CHAT' | 'CHATTING' | 'FOLLOW_UP' | 'COMPLETED' | 'TERMINATED';

export type Theme = 'playful' | 'hybrid';

/**
 * Education level input uses lowercase values.
 * Service layer normalizes from Prisma SCREAMING_CASE via `.toLowerCase()`.
 */
export type EducationLevelInput = 'elementary' | 'junior_high' | 'senior_high';

export type Perception = 'UNDERESTIMATE' | 'OVERESTIMATE' | 'BARRIER' | 'ADEQUATE';

export interface SessionContext {
  sessionId: string;
  state: SessionState;
  theme: Theme;
  locale: SupportedLocale;
  turn: number;
  categoriesCovered: CategoryName[];
  categoriesFollowedUp: CategoryName[];
  followUpTarget: CategoryName | null;
  offTopicCount: number;
  shortAnswerCount: number;
}

// ─── State Transition ───

export type TransitionEvent =
  | { type: 'DEMOGRAPHICS_SUBMITTED' }
  | { type: 'EXTRACTION_RECEIVED'; extraction: CategoryExtraction }
  | { type: 'LOW_CONFIDENCE'; category: CategoryName }
  | { type: 'FOLLOW_UP_RESPONSE'; category: CategoryName; extraction: CategoryExtraction }
  | { type: 'ALL_CATEGORIES_COVERED' }
  | { type: 'FORCE_CLOSE' }
  | { type: 'CRISIS_DETECTED' };

export interface TransitionResult {
  newState: SessionState;
  context: SessionContext;
}

export interface TransitionError {
  type: 'INVALID_TRANSITION';
  from: SessionState;
  event: TransitionEvent['type'];
  message: string;
}

// ─── Instructions ───

export type InstructionType =
  | 'EXPLORE_CATEGORY'
  | 'FOLLOW_UP'
  | 'REDIRECT_ON_TOPIC'
  | 'SHORT_ANSWER_FOLLOW_UP'
  | 'LONG_MESSAGE_CONFIRM'
  | 'SESSION_CLOSE_OFFER'
  | 'CRISIS_HALT'
  | 'COMPLETE';

export interface Instruction {
  type: InstructionType;
  targetCategory: CategoryName | null;
  isFollowUp: boolean;
  metadata?: Record<string, unknown>;
}

export interface CrisisInstruction {
  type: 'CRISIS_HALT';
  helplineNumbers: { id: string; international: string };
  message: string;
  terminateSession: true;
}

// ─── Persona ───

export interface PersonaRules {
  theme: Theme;
  pronounSelf: string;
  pronounUser: string;
  maxWordsPerSentence: number;
  emojiRange: [number, number];
  vocabularyLevel: 'everyday' | 'semi-formal';
  allowMedicalTerms: boolean;
}

// ─── Opening Message ───

export interface OpeningMessage {
  theme: Theme;
  locale: SupportedLocale;
  content: string;
}

// ─── Output Generation ───

export interface OutputContext {
  riskLevel: RiskLevel;
  perception: Perception;
  locale: SupportedLocale;
  theme: Theme;
  categoriesAssessed: CategoryName[];
  categoriesNotAssessed: CategoryName[];
  isForceClose: boolean;
  matchedKeywords: Record<CategoryName, string[]>;
  scores: Record<CategoryName, number>;
  totalScore: number;
}

export interface OutputTemplate {
  kesimpulan: string;
  rekomendasi: string;
}

export interface FallbackOutput {
  kesimpulan: string;
  persepsi: null;
  rekomendasi: string;
  saranPenanganan: null;
}

// ─── Category Tracking ───

export interface CategoryState {
  covered: boolean;
  confidence: Confidence | null;
  followUpUsed: boolean;
  exhausted: boolean;
}

export type CategoryTracker = Record<CategoryName, CategoryState>;

// ─── Edge Cases ───

export interface EdgeCaseResult {
  type: 'short_answer' | 'off_topic' | 'long_message' | 'normal';
  instruction?: Instruction;
  shouldAdvance?: boolean;
}

// ─── Session Metadata ───

/**
 * Shape of the JSON stored in the `metadata` field of ScreeningSession.
 * Used by the chat service for session state reconstruction from DB.
 * DB field added via migration (task 1.3).
 */
export interface SessionMetadata {
  followedUp: CategoryName[];
  followUpTarget: CategoryName | null;
  offTopicCount: number;
  shortAnswerCount: number;
  isForceClose: boolean;
}
