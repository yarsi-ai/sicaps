/**
 * Public UI domain types for the screening feature.
 * Used by client components, hooks, and local state management.
 */

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type EducationLevel = 'elementary' | 'junior_high' | 'senior_high' | 'university';

export type ChatMessage = {
  id: string;
  role: 'bot' | 'user';
  content: string;
  timestamp: Date;
  isVoice: boolean;
  quickReplies?: string[]; // only on bot messages
};

export type HistoryEntry = {
  id: string; // uuid
  sessionId: string; // server session ID
  shareToken: string; // for transcript verification
  createdAt: string; // ISO 8601
  score: number | null; // 0-12, null if unfinished
  riskLevel: RiskLevel | null; // null if unfinished
  mode: 'ai' | 'questionnaire';
  finished: boolean;
  locale: 'id' | 'en';
  categoriesCovered: string[]; // for resumption
};

export type DemographicsCache = {
  nama?: string;
  usia: number;
  gender: 'male' | 'female';
  educationLevel: EducationLevel;
};

export type ScoringCategory =
  | 'intensitas'
  | 'waktu'
  | 'lokasi_tubuh'
  | 'kontak'
  | 'lesi'
  | 'faktor_risiko';

export type FallbackCategory = {
  key: ScoringCategory;
  labelId: string; // i18n key
  options: FallbackOption[];
  selectMode: 'single' | 'multi';
};

export type FallbackOption = {
  labelId: string; // i18n key
  score: number; // 0, 1, or 2
};

export type FallbackState = {
  currentCategoryIndex: number;
  selections: Record<ScoringCategory, number[]>; // indices of selected options
  coveredFromChat: ScoringCategory[]; // already scored in AI mode
  chatScore: number; // partial score from AI
};

export type SSEError = {
  code: string;
  message: string;
  retryable: boolean;
};
