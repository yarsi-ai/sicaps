/**
 * Frontend-specific screening types used by the public UI components.
 * These types match the .private/frontend design reference.
 */

export type Gender = 'L' | 'P' | '';
export type Persona = 'adequate' | 'underestimate';
export type RiskKey = 'tinggi' | 'sedang' | 'rendah';
export type ScreeningMode = 'ai' | 'q';

export interface ScriptOption {
  /** short quick-reply chip label */
  t: string;
  /** full reply text shown in the transcript */
  r: string;
  /** score points (0-2) */
  s: number;
}

export interface ScriptStep {
  cat: string;
  q: string;
  opts: ScriptOption[];
}

export interface ChatOption {
  label: string;
  replyText: string;
}

export interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
  step?: number;
  done?: boolean;
  /** quick-reply chips for this bot question, if any */
  options?: ChatOption[];
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  shareToken: string;
  createdAt: string;
  score: number;
  level: RiskKey;
  mode: ScreeningMode;
  finished: boolean;
  nama?: string;
  usia?: number;
  jenisKelamin?: string;
}

export interface RiskLevel {
  key: RiskKey;
  label: string;
  bg: string;
  color: string;
}

export interface ResultCopy {
  kesimpulan: string;
  persona: string;
  aksi: string[];
  saran: string;
}

export interface DemographicsInput {
  nama?: string;
  usia?: number;
  jenisKelamin?: Gender;
  pendidikan?: string;
}
