import { z } from 'zod';

/**
 * V2 AI mode schema: free-text chat with the LLM.
 * Supports optional quickReplyToken for phase-transition shortcuts.
 */
export const chatV2Schema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  quickReplyToken: z.string().optional(),
  isVoice: z.boolean().default(false),
});

/**
 * V1 AI mode schema: free-text chat with the LLM.
 * Kept for backward compatibility during v1→v2 transition.
 */
export const chatAiSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
  isVoice: z.boolean().default(false),
});

/** Alias for clarity — same schema as chatAiSchema. */
export const chatRequestSchema = chatAiSchema;

/**
 * V1 Questionnaire mode schema: pill selections instead of free text.
 */
export const chatQuestionnaireSchema = z.object({
  sessionId: z.string().uuid(),
  selectedPills: z.array(z.string()).nonempty(),
});

export type ChatV2Request = z.infer<typeof chatV2Schema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatAiRequest = z.infer<typeof chatAiSchema>;
export type ChatQuestionnaireRequest = z.infer<typeof chatQuestionnaireSchema>;
