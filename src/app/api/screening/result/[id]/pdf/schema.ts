import { z } from 'zod';

export const pdfParamsSchema = z.object({
  id: z.string().uuid(),
});

export const pdfTokenQuerySchema = z.object({
  token: z.string().uuid(),
});

export type PdfParams = z.infer<typeof pdfParamsSchema>;
export type PdfTokenQuery = z.infer<typeof pdfTokenQuerySchema>;
