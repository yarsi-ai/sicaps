/**
 * Production barrel — single entry point for route handlers.
 * Exposes application use cases and required domain types.
 */

// Application use cases
export { processChatTurn, processQuestionnaireAnswer } from './application/chat.service';
export {
  createSession,
  getResult,
  getSessionState,
  getTranscript,
  verifySessionAccess,
} from './application/screening.service';

// Application types
export type { StartInput, StartResponse, ResultResponse } from './application/screening.service';

// Domain types needed by external consumers
export type { SessionContext, Perception, Theme, EducationLevelInput } from './domain/types';
export type { ScoringResult, CategoryName, CategoryExtraction } from './domain/keywords/types';

// Domain config
export type { RiskLevel } from './domain/config';
export { getRiskLevel } from './domain/config';
