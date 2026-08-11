/**
 * Tooling barrel — Screening Chat V2
 *
 * Extended entry point for testing console and playground.
 * Re-exports everything from the production barrel plus domain/adapter internals.
 *
 * Requirements: 1.1, 1.2
 */

// Production barrel (public API)
export * from './index';

// Domain — Scoring
export { calculateRisk } from './domain/scoring/engine';
export { validateExtraction } from './domain/scoring/validator';

// Domain — State Machine
export { nextPhase, shouldNudge, isTerminal } from './domain/chat/state-machine';

// Domain — Coverage
export { mergeCoverage, applyCorrection, isCoverageComplete } from './domain/chat/coverage';

// Domain — Crisis
export { checkCrisis } from './domain/chat/crisis';

// Domain — Checkpoint
export { buildSummary } from './domain/chat/checkpoint';

// Domain — Keywords (canonical tables)
export { SCORING_TABLE, KEYWORD_TABLE, CANONICAL_LIST } from './domain/keywords/id';

// Adapters — LLM
export { ExtractionSchema } from './adapters/llm/schemas';
export { parseExtraction } from './adapters/llm/parser';
export { buildExtractMessages, buildComposeMessages } from './adapters/llm/prompts';

// Domain types (re-export all types)
export type * from './domain/types';

// Additional types for tooling
export type { SessionSnapshot } from './domain/chat/state-machine';
export type { ScoringResult } from './domain/scoring/types';
