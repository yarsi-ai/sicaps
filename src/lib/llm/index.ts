// Barrel export for lib/llm/ — shared infra only (per coding standards)
// Domain-specific LLM logic (schemas, parser, prompts, stream-helpers) moved to
// @/features/screening-chat-v1/adapters/llm/

export {
  createLLMClient,
  getPrimaryClient,
  getFallbackClient,
  getLLMConfig,
  getFallbackModel,
} from './client';
export type { LLMConfig } from './client';

export { getFallbackOutput } from './templates';
export type { FallbackLocale, FallbackRiskLevel } from './templates';
