/**
 * Tooling barrel — extended entry point for console, playground, and testing.
 * Re-exports everything from index.ts plus domain/adapter internals.
 */

export * from './index';

// Domain scoring internals
export {
  calculateAllScores,
  calculateCategoryScore,
  calculateHybridScore,
} from './domain/scoring/engine';
export type { PillResolver } from './domain/scoring/engine';
export { matchKeywords } from './domain/scoring/matcher';
export { appendToPool } from './domain/scoring/pool';
export { normalize } from './domain/scoring/normalize';
export { categoryExtractionSchema, scoringInputSchema } from './domain/scoring/schema';

// Domain keywords internals
export { PATTERN_TABLE_ID } from './domain/keywords/id';
export { PATTERN_TABLE_EN } from './domain/keywords/en';

// Domain chat internals
export { checkCrisis } from './domain/chat/crisis';
export { getNextInstruction, buildCategoryTracker } from './domain/chat/instruction';
export { createInitialContext, transition, isTerminalState } from './domain/chat/state-machine';
export { selectTheme, getPersonaRules } from './domain/chat/persona';
export { getOpeningMessage } from './domain/chat/opening';
export { determineCoveredCategories } from './domain/chat/coverage';
export { buildOutputContext, getFallbackTemplate } from './domain/chat/output';
export { detectEdgeCase } from './domain/chat/edge-cases';
export { getPerceptionIndicators, buildPerceptionInferenceContext } from './domain/chat/perception';

// Adapter LLM internals
export {
  buildSystemMessage,
  buildMessages,
  buildOutputMessages,
  PROMPT_VERSION,
} from './adapters/llm/prompts';
export type {
  SessionContext as PromptSessionContext,
  OutputContext as PromptOutputContext,
} from './adapters/llm/prompts';
export {
  parseLLMResponse,
  parseOutputResponse,
  extractReplyFromPartial,
} from './adapters/llm/parser';
export { llmChatResponseSchema, llmOutputResponseSchema } from './adapters/llm/schemas';
export { encodeSSE, createReplyDetector } from './adapters/llm/stream-helpers';
export type { SSEEvent, DonePayload, ErrorPayload } from './adapters/llm/stream-helpers';

// Adapter questionnaire internals
export { getPills, getPillById } from './adapters/questionnaire/pills';
export { calculatePillScore } from './adapters/questionnaire/scorer';

// All types
export type * from './domain/types';
export type * from './domain/keywords/types';
