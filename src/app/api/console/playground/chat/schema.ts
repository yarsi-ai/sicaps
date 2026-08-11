import { z } from 'zod';

export const playgroundChatRequestSchema = z.object({
  provider: z.enum(['groq', 'huggingface', 'gemini', 'ollama']),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxTokens: z.number().int().min(1).max(4096),
  systemPrompt: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1),
  enableScoring: z.boolean().default(false),
  locale: z.enum(['id', 'en']).default('id'),
  sessionId: z.string().uuid().optional(),
  mode: z.enum(['single-shot', 'multi-turn', 'compare']),
});

export type PlaygroundChatRequest = z.infer<typeof playgroundChatRequestSchema>;
