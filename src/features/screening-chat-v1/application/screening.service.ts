import { prisma } from '@/db/prisma';
import { EducationLevel } from '@prisma/client';
import { checkLLMHealth } from '@/services/llm.service';
import { selectTheme } from '../domain/chat/persona';
import { getOpeningMessage } from '../domain/chat/opening';
import { getPills } from '../adapters/questionnaire/pills';
import { InvalidTokenError, SessionNotFoundError } from '@/lib/errors';
import { parseCategoriesCovered, parseScores } from '@/lib/prisma-json';
import { verifyShareToken } from '@/lib/token';
import type { SupportedLocale } from '../domain/config';
import type { Theme, EducationLevelInput } from '../domain/types';
import type { CategoryName } from '../domain/keywords/types';

// ─── Types ───

export interface StartInput {
  demographics: {
    name?: string | null;
    age: number;
    gender: 'male' | 'female';
    educationLevel: 'elementary' | 'junior_high' | 'senior_high';
  };
  locale: SupportedLocale;
}

export interface StartResponse {
  sessionId: string;
  shareToken: string;
  theme: Theme;
  locale: SupportedLocale;
  mode: 'ai' | 'questionnaire';
  openingMessage: string;
  pills?: Array<{ id: string; label: string }>;
  pillSelection?: 'single' | 'multi';
}

// ─── Constants ───

/** Confirmation pills shown when entering questionnaire mode */
const CONFIRMATION_PILLS: Record<SupportedLocale, Array<{ id: string; label: string }>> = {
  id: [
    { id: 'confirm_continue', label: 'Ya, lanjutkan' },
    { id: 'confirm_cancel', label: 'Nanti saja' },
  ],
  en: [
    { id: 'confirm_continue', label: 'Yes, continue' },
    { id: 'confirm_cancel', label: 'Maybe later' },
  ],
};

/** Questionnaire mode opening messages per locale */
const QUESTIONNAIRE_OPENING: Record<SupportedLocale, string> = {
  id: 'Saat ini SICAPS sedang offline. Kamu tetap bisa melakukan screening dengan menjawab pertanyaan pilihan. Hasil tetap akurat. Lanjutkan?',
  en: 'SICAPS is currently offline. You can still complete the screening by answering multiple-choice questions. Results remain accurate. Continue?',
};

// ─── Helpers ───

/** Map lowercase educationLevel to Prisma enum */
function toPrismaEducationLevel(level: EducationLevelInput): EducationLevel {
  const mapping: Record<EducationLevelInput, EducationLevel> = {
    elementary: EducationLevel.ELEMENTARY,
    junior_high: EducationLevel.JUNIOR_HIGH,
    senior_high: EducationLevel.SENIOR_HIGH,
  };
  return mapping[level];
}

// ─── Public API ───

// ─── Session Access Verification ───

/** UUID v4 format regex */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifiedSession {
  id: string;
  locale: string;
}

export interface VerifySessionOptions {
  requireCompleted?: boolean;
}

/**
 * Verifies session access: validates token format, loads session from DB,
 * checks status if required, and performs timing-safe token comparison.
 * Throws InvalidTokenError or SessionNotFoundError on failure.
 */
export async function verifySessionAccess(
  sessionId: string,
  token: string | null,
  options?: VerifySessionOptions,
): Promise<VerifiedSession> {
  if (!token || !UUID_REGEX.test(token)) {
    throw new InvalidTokenError();
  }

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    select: { id: true, shareToken: true, status: true, locale: true },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  if (options?.requireCompleted && session.status !== 'COMPLETED') {
    throw new SessionNotFoundError();
  }

  if (!session.shareToken || !verifyShareToken(token, session.shareToken)) {
    throw new InvalidTokenError();
  }

  return { id: session.id, locale: session.locale };
}

// ─── Session Creation ───

/**
 * Creates a new screening session with demographics.
 * Checks LLM availability to determine mode (ai vs questionnaire).
 * Returns the StartResponse for the route handler to wrap in an envelope.
 */
export async function createSession(input: StartInput): Promise<StartResponse> {
  const { demographics, locale } = input;

  // 1. Check LLM availability
  const llmAvailable = await checkLLMHealth();

  // 2. Determine theme from educationLevel
  const theme = selectTheme(demographics.educationLevel);

  // 3. Determine mode
  const mode: 'ai' | 'questionnaire' = llmAvailable ? 'ai' : 'questionnaire';

  // 4. Create ScreeningSession + Demographics in a transaction
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.screeningSession.create({
      data: {
        locale,
        mode,
        status: 'IN_PROGRESS',
        demographics: {
          create: {
            name: demographics.name ?? null,
            age: demographics.age,
            gender: demographics.gender,
            educationLevel: toPrismaEducationLevel(demographics.educationLevel),
          },
        },
      },
      select: {
        id: true,
        shareToken: true,
      },
    });

    return created;
  });

  // 5. Read shareToken (auto-generated by Prisma @default(uuid()))
  if (!session.shareToken) {
    throw new Error('Session created without shareToken — database default may be missing');
  }
  const shareToken = session.shareToken;

  // 6. Generate opening message
  let openingMessage: string;
  if (mode === 'ai') {
    openingMessage = getOpeningMessage(theme, locale);
  } else {
    openingMessage = QUESTIONNAIRE_OPENING[locale];
  }

  // 7. Build response
  const response: StartResponse = {
    sessionId: session.id,
    shareToken,
    theme,
    locale,
    mode,
    openingMessage,
  };

  // 8. If questionnaire mode: include confirmation pills
  if (mode === 'questionnaire') {
    response.pills = CONFIRMATION_PILLS[locale];
    response.pillSelection = 'single';
  }

  return response;
}

// ─── Result Types ───

export interface ResultResponse {
  sessionId: string;
  completedAt: string;
  demographics: { name: string | null; age: number; gender: string; educationLevel: string };
  totalScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  scores: Record<string, number>;
  conclusion: string;
  perceptionResponse: string | null;
  recommendation: string;
  personalizedSuggestion: string | null;
}

// ─── Result ───

/**
 * Loads a completed screening session and returns result data.
 * Throws SessionNotFoundError if session doesn't exist or isn't COMPLETED.
 */
export async function getResult(sessionId: string): Promise<ResultResponse> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { demographics: true },
  });

  if (!session || session.status !== 'COMPLETED') {
    throw new SessionNotFoundError();
  }

  const demographics = session.demographics
    ? {
        name: session.demographics.name,
        age: session.demographics.age,
        gender: session.demographics.gender,
        educationLevel: session.demographics.educationLevel.toLowerCase(),
      }
    : { name: null, age: 0, gender: 'unknown', educationLevel: 'unknown' };

  const isQuestionnaire = session.mode === 'questionnaire';

  return {
    sessionId: session.id,
    completedAt: session.completedAt?.toISOString() ?? session.updatedAt.toISOString(),
    demographics,
    totalScore: session.totalScore ?? 0,
    riskLevel: session.riskLevel ?? 'LOW',
    scores: parseScores(session.scores),
    conclusion: session.aiConclusion ?? '',
    perceptionResponse: isQuestionnaire ? null : (session.aiPerceptionResponse ?? null),
    recommendation: session.aiRecommendation ?? '',
    personalizedSuggestion: isQuestionnaire ? null : (session.aiSuggestion ?? null),
  };
}

// ─── Session State Types ───

export interface SessionStateResponse {
  sessionId: string;
  status: 'in_progress' | 'completed';
  mode: 'ai' | 'questionnaire';
  theme: 'playful' | 'hybrid';
  locale: 'id' | 'en';
  messages: Array<{ role: 'bot' | 'user'; content: string; timestamp: string }>;
  categoriesCovered: string[];
  currentPills: {
    pills: Array<{ id: string; label: string }>;
    pillSelection: 'single' | 'multi';
  } | null;
}

// ─── Session State Constants ───

const CATEGORY_ORDER: CategoryName[] = [
  'intensitas',
  'waktu',
  'lokasi_tubuh',
  'kontak',
  'lesi',
  'faktor_risiko',
];

// ─── Session State ───

/**
 * Loads a screening session state for restoration (e.g., page refresh).
 * Returns messages, current pills, and session metadata.
 */
export async function getSessionState(sessionId: string): Promise<SessionStateResponse> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      demographics: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  // Map messages: assistant→bot, user→user
  const messages = session.messages.map((msg) => ({
    role: (msg.role === 'assistant' ? 'bot' : 'user') as 'bot' | 'user',
    content: msg.content,
    timestamp: msg.createdAt.toISOString(),
  }));

  // Determine theme from demographics.educationLevel via selectTheme
  const educationLevel = session.demographics?.educationLevel?.toLowerCase() as
    | EducationLevelInput
    | undefined;
  const theme = selectTheme(educationLevel);

  // Parse categoriesCovered from session JSON field
  const categoriesCovered = parseCategoriesCovered(session.categoriesCovered);

  // Determine currentPills: only for questionnaire mode + IN_PROGRESS
  let currentPills: SessionStateResponse['currentPills'] = null;
  if (session.mode === 'questionnaire' && session.status === 'IN_PROGRESS') {
    const nextCategory = CATEGORY_ORDER.find((c) => !categoriesCovered.includes(c));
    if (nextCategory) {
      const locale = session.locale as SupportedLocale;
      const pills = getPills(locale, nextCategory).map((p) => ({ id: p.id, label: p.label }));
      currentPills = { pills, pillSelection: 'multi' };
    }
  }

  // Map status: 'IN_PROGRESS' → 'in_progress', 'COMPLETED' → 'completed'
  const status: 'in_progress' | 'completed' =
    session.status === 'IN_PROGRESS' ? 'in_progress' : 'completed';

  return {
    sessionId: session.id,
    status,
    mode: session.mode as 'ai' | 'questionnaire',
    theme,
    locale: session.locale as 'id' | 'en',
    messages,
    categoriesCovered,
    currentPills,
  };
}

// ─── Transcript ───

export interface TranscriptMessage {
  role: 'bot' | 'user';
  content: string;
  createdAt: string;
  isVoice: boolean;
}

/**
 * Loads all chat messages for a screening session, ordered by createdAt.
 * Used by the transcript read-only page.
 */
export async function getTranscript(sessionId: string): Promise<{ messages: TranscriptMessage[] }> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true, isVoice: true },
  });

  return {
    messages: messages.map((msg) => ({
      role: (msg.role === 'assistant' ? 'bot' : 'user') as 'bot' | 'user',
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      isVoice: msg.isVoice,
    })),
  };
}
