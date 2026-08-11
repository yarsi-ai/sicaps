import { z } from 'zod';

export const playgroundPromptRequestSchema = z.object({
  theme: z.enum(['playful', 'hybrid']),
  locale: z.enum(['id', 'en']),
  turn: z.number().int().min(1).max(7),
  demographics: z.object({
    age: z.number().int().min(6).max(99),
    gender: z.string(),
  }),
  categoriesCovered: z.array(z.string()).default([]),
  categoriesRemaining: z
    .array(z.string())
    .default(['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko']),
});

export type PlaygroundPromptRequest = z.infer<typeof playgroundPromptRequestSchema>;
