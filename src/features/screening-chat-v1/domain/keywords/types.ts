import type { RiskLevel } from '../config';

export type Confidence = 'high' | 'medium' | 'low';

export type Locale = 'id' | 'en';

export type CategoryStatus = 'assessed' | 'not_assessed';

export type CategoryName =
  | 'intensitas'
  | 'waktu'
  | 'lokasi_tubuh'
  | 'kontak'
  | 'lesi'
  | 'faktor_risiko';

export interface ExtractedKeyword {
  keyword: string;
  confidence: Confidence;
}

export interface CategoryExtraction {
  intensitas: ExtractedKeyword[];
  waktu: ExtractedKeyword[];
  lokasi_tubuh: ExtractedKeyword[];
  kontak: ExtractedKeyword[];
  lesi: ExtractedKeyword[];
  faktor_risiko: ExtractedKeyword[];
}

export interface KeywordRule {
  patterns: string[];
  score: number;
}

export interface PatternTable {
  positive: Record<CategoryName, KeywordRule[]>;
  negative: Partial<Record<CategoryName, KeywordRule[]>>;
}

export interface PoolEntry {
  keyword: string;
  confidence: Confidence;
  turn: number;
  matched: boolean;
  matchedPattern: string | null;
}

export interface KeywordPool {
  intensitas: PoolEntry[];
  waktu: PoolEntry[];
  lokasi_tubuh: PoolEntry[];
  kontak: PoolEntry[];
  lesi: PoolEntry[];
  faktor_risiko: PoolEntry[];
}

export interface NormalizedKeyword {
  original: string;
  normalized: string;
}

export interface MatchResult {
  score: number;
  matchedPatterns: string[];
  unmatchedKeywords: string[];
}

export interface CategoryScore {
  raw: number;
  capped: number;
  status: CategoryStatus;
  matchedPatterns: string[];
  unmatchedKeywords: string[];
}

export interface ScoringResult {
  version: string;
  scores: Record<CategoryName, CategoryScore>;
  totalScore: number;
  riskLevel: RiskLevel;
}

export interface Pill {
  id: string;
  label: string;
  score: number;
  category: CategoryName;
  locale: Locale;
  isNegative?: boolean;
}

export interface PillSelection {
  pillId: string;
  category: CategoryName;
}
