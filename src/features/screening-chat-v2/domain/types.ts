/**
 * Domain types for Screening Chat V2.
 *
 * All types are union-based (no enums) per coding standards.
 * Indonesian domain terms preserved in English form in code.
 */

// --- Session Phase (7-phase state machine) ---

export type SessionPhase =
  | 'GREETING'
  | 'COLLECTING'
  | 'ASKING_PERCEPTION'
  | 'OFFERING_RESULT'
  | 'SCREENING_COMPLETE'
  | 'FOLLOW_UP'
  | 'CLOSED';

// --- Risk & Clinical Types ---

export type RiskLevel = 'HIGH' | 'MODERATE' | 'LOW';

export type Perception = 'underestimate' | 'overestimate' | 'barrier' | 'adequate';

export type Emosi = 'takut' | 'malu' | 'santai' | 'netral' | 'ingin_sembuh';

// --- Dimension (6 clinical categories) ---

export type DimensionName =
  | 'intensitas'
  | 'waktu'
  | 'lokasi_tubuh'
  | 'kontak'
  | 'lesi'
  | 'faktor_risiko';

export const ALL_DIMENSIONS: DimensionName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

// --- Scoring State (binary algorithm: 3 gejala kunci + 2 faktor tambahan) ---

export interface ScoringState {
  gatalMalam: boolean;
  kontakSerupa: boolean;
  lokasiKhas: boolean;
  asrama: boolean;
  tukarAlat: boolean;
}

// --- Chips Sub-State Machine ---

export type ChipsSubState = 'FREE_TEXT' | 'CHIPS_PENDING' | 'CHIPS_ACTIVE';

export type ChipsType = 'kontak' | 'lokasi' | 'asrama' | 'tukar_alat';

// --- Tone & Education ---

export type ToneTheme = 'playful' | 'hybrid';

export type EducationLevel = 'ELEMENTARY' | 'JUNIOR_HIGH' | 'SENIOR_HIGH';

// --- Chips Request (SSE payload for chip selector UI) ---

export interface ChipsOption {
  token: string;
  label: string;
  group?: string;
}

export interface ChipsGroup {
  id: string;
  question: string;
  options: ChipsOption[];
}

export interface ChipsRequest {
  id: string;
  type: 'single' | 'multi';
  question: string;
  options: ChipsOption[];
  allowFreeText: boolean;
  groups?: ChipsGroup[];
}

// --- Quick Reply ---

export interface QuickReply {
  token: string;
  label: string;
  icon?: string;
}

// --- SSE Events ---

export type SSEEvent =
  | { type: 'token'; data: string }
  | { type: 'phase'; data: SessionPhase }
  | { type: 'perception'; data: string }
  | { type: 'chips_request'; data: ChipsRequest }
  | { type: 'quick_replies'; data: QuickReply[] }
  | { type: 'result'; data: { revision: number; riskLevel: RiskLevel; totalScore: number } }
  | {
      type: 'extraction';
      data: {
        dimensiTerisi: string[];
        dimensiBelum: string[];
        dimensiDetail?: Record<string, { keywords: string[]; negasi: string[] }>;
      };
    }
  | {
      type: 'scoring';
      data: { state: ScoringState; riskLevel: RiskLevel; chipsAnswered?: ChipsType[] };
    }
  | { type: 'done'; data: { turnCount: number } }
  | { type: 'error'; data: { code: string; message: string } };

// --- Instruction Context (injected into LLM prompts) ---

export interface InstructionContext {
  phase: SessionPhase;
  dimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }>;
  dimensiBelum: string[];
  turnCount: number;
  locale: 'id' | 'en';
  shouldNudge: boolean;
  scoringState: ScoringState;
  chipsSubState: ChipsSubState;
  toneTheme: ToneTheme;
  perception: string | null;
}
