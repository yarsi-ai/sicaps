/**
 * Production barrel — Screening Chat V2
 *
 * Single entry point for route handlers. Only public API is exported here.
 * Use `internal.ts` for testing/tooling access.
 *
 * Requirements: 1.1, 1.2
 */

export { processChatTurn } from './application/chat.service';
export {
  createSession,
  advancePhaseAfterImage,
  getResult,
  getSessionState,
  resumeSession,
  finalize,
} from './application/screening.service';
export type {
  StartInput,
  StartResponse,
  ResultResponse,
  ResumeResponse,
} from './application/screening.service';
export type { SessionSnapshot } from './domain/chat/state-machine';
export type { SessionPhase } from './domain/types';
export type { ScoringResult } from './domain/scoring/types';
export type { QuickReply, SSEEvent } from './domain/types';
