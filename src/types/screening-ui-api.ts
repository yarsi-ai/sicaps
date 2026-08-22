/**
 * Frontend API request/response types for the public screening UI.
 * These match the stubbed API routes used by the design reference.
 */

import type { ChatMessage, DemographicsInput, RiskKey, ScreeningMode } from './screening-ui';
import type { RiskLevel } from '@/features/screening-chat-v2/domain/types';

export interface StartRequest {
  demographics: DemographicsInput;
  incognito?: boolean;
  locale: string;
}

export interface StartResponse {
  sessionId: string;
  shareToken: string;
  mode: ScreeningMode;
  message: ChatMessage;
}

export interface ChatRequest {
  sessionId: string;
  locale: string;
  /** free-typed or voice-transcribed text; ignored server-side when optionIndex is set */
  text: string;
  /** index into the previous bot message's `options`, if a quick-reply chip was tapped */
  optionIndex?: number;
}

export interface ResultPayload {
  sessionId: string;
  shareToken: string;
  score: number;
  level: RiskKey;
  needsReview: boolean;
  kesimpulan: string;
  persona: string;
  aksi: string[];
  saran: string;
}

export type ChatStreamEvent =
  | { type: 'typing' }
  | { type: 'message'; message: ChatMessage }
  | { type: 'finished'; result: ResultPayload }
  | { type: 'error'; message: string };

export interface ResultResponse extends ResultPayload {
  mode: ScreeningMode;
  createdAt: string;
  transcript: ChatMessage[];
}

/** V2 result response — new shape, does NOT extend ResultPayload */
export interface ResultResponseV2 {
  riskLevel: RiskLevel;
  gejalaCount: number;
  faktorCount: number;
  scoringState: Record<string, boolean>;
  perception: string;
  partial: boolean;
  edukasi: string[];
  aiConclusion: string | null;
  aiPerceptionResponse: string | null;
  aiRecommendation: string | null;
  aiSuggestion: string | null;
  /** Visual detection result (POSITIVE/NEGATIVE) from image analysis */
  visualResult: 'POSITIVE' | 'NEGATIVE' | null;
  /** Combined final output from chat risk + visual detection */
  finalOutput: 'SUSPECTED_SCABIES' | 'NOT_SCABIES' | null;
  /** Whether visual prediction failed after exhausting retries */
  visualPredictionFailed: boolean;
}
