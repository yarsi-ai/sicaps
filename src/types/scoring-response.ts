/**
 * Shared types for the scoring endpoint response.
 * Used by both the route handler (producer) and TestingContext (consumer).
 */

export interface ScoringSessionOutput {
  conclusion: string | null;
  perceptionResponse: string | null;
  recommendation: string | null;
  suggestion: string | null;
}

export interface ScoringSessionDemographics {
  id: string;
  sessionId: string;
  age: number;
  gender: string;
  educationLevel: string;
  name: string | null;
  createdAt: string | Date;
}

export interface ScoringSessionData {
  id: string;
  source: string;
  createdAt: string | Date;
  demographics: ScoringSessionDemographics | null;
  status: string;
  mode: string;
  completedAt: string | Date | null;
  metadata: Record<string, unknown> | null;
  perception: string | null;
  scores: Record<
    string,
    | number
    | {
        raw?: number;
        capped?: number;
        status?: string;
        matchedPatterns?: string[];
        unmatchedKeywords?: string[];
      }
  > | null;
  output: ScoringSessionOutput;
  // V2 binary scoring fields
  scoringState: Record<string, boolean> | null;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }> | null;
  dimensiBelum: string[];
  chipsAnswered: string[];
}

export interface ScoringTurnLog {
  id: string;
  turnNumber: number;
  userMessage: string;
  rawResponse: string;
  parseStatus: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
  parseError: string | null;
  systemMessage: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokenUsage: { input: number; output: number } | null;
  retryCount: number;
}

export interface ScoringTurnExtraction {
  extraction: Record<string, Array<{ keyword: string; confidence: string | number }>> | null;
  scores: Record<string, { raw?: number; capped?: number; score?: number }> | null;
}

export interface ScoringTurnFeedback {
  isAccurate: boolean;
  notes: string | null;
}

export interface ScoringTurnData {
  turnNumber: number;
  log: ScoringTurnLog;
  extraction: ScoringTurnExtraction | null;
  feedback: ScoringTurnFeedback | null;
}

export interface ScoringOverview {
  totalScore: number | null;
  riskLevel: string | null;
  categoriesCovered: string[];
  categoriesRemaining: string[];
}

export interface ScoringEndpointResponse {
  session: ScoringSessionData;
  turns: ScoringTurnData[];
  scoring: ScoringOverview;
}
