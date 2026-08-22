// Barrel export for lib/vision/ — pure validation, parsing, and combination logic.
// No Prisma, service, or Next.js imports, and no I/O (CODING_STANDARDS §3.3).
// The external HTTP call lives in services/vision-api.service.ts.

export { isAllowedMimeType, isWithinSizeLimit } from './validation';
export { combineFinalOutput } from './result-combiner';
export type { ChatbotRiskLevel, VisualResult, FinalOutput } from './result-combiner';
export { evaluateAttempts } from './attempt-runner';
export type { AttemptOutcome, AttemptRunResult } from './attempt-runner';
export { visionResponseSchema, parseVisionResponse } from './vision-response';
export type { VisionPredictionResult, VisionResponse } from './vision-response';
export {
  apiEnvelopeSchema,
  visualResultSchema,
  finalOutputSchema,
  imageGateStatusSchema,
  imageSubmitResultSchema,
  imageGateStatusEnvelopeSchema,
  imageSubmitResultEnvelopeSchema,
} from './api-contract';
export type { ImageGateStatusResponse, ImageSubmitResultResponse } from './api-contract';
