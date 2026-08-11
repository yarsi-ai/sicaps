import { NextRequest, NextResponse } from 'next/server';

import { errorResponse, successResponse } from '@/lib/api/response';
import {
  buildSystemMessage,
  getNextInstruction,
  buildCategoryTracker,
} from '@/features/screening-chat-v1/internal';
import type {
  CategoryName,
  Instruction,
  SessionContext as ChatSessionContext,
} from '@/features/screening-chat-v1/internal';

import { playgroundPromptRequestSchema } from './schema';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = playgroundPromptRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      errorResponse('VALIDATION_ERROR', 'Validation failed', [parsed.error.flatten().fieldErrors]),
      { status: 400 },
    );
  }

  const { theme, locale, turn, demographics, categoriesCovered, categoriesRemaining } = parsed.data;

  const systemPrompt = buildSystemMessage({
    theme,
    locale,
    turn,
    demographics,
    categoriesCovered,
    categoriesRemaining,
  });

  const guidance = computeGuidance(categoriesCovered, categoriesRemaining, turn);

  return NextResponse.json(successResponse({ systemPrompt, guidance }));
}

// ─── Helpers ───

interface GuidanceResult {
  instruction: 'EXPLORE' | 'FOLLOW_UP' | 'COMPLETE' | 'REDIRECT';
  targetCategory: string | null;
  isFollowUp: boolean;
  reason: string;
}

function computeGuidance(
  categoriesCovered: string[],
  categoriesRemaining: string[],
  turn: number,
): GuidanceResult {
  const categoryTracker = buildCategoryTracker(categoriesCovered as CategoryName[], []);

  const sessionContext: ChatSessionContext = {
    sessionId: 'playground',
    state: categoriesCovered.length >= 6 ? 'COMPLETED' : 'CHATTING',
    theme: 'hybrid',
    locale: 'id',
    turn,
    categoriesCovered: categoriesCovered as CategoryName[],
    categoriesFollowedUp: [],
    followUpTarget: null,
    offTopicCount: 0,
    shortAnswerCount: 0,
  };

  const instruction = getNextInstruction(sessionContext, categoryTracker, null);
  const reason = buildGuidanceReason(instruction, categoriesRemaining);

  return {
    instruction: mapInstructionType(instruction.type),
    targetCategory: instruction.targetCategory,
    isFollowUp: instruction.isFollowUp,
    reason,
  };
}

function buildGuidanceReason(instruction: Instruction, categoriesRemaining: string[]): string {
  if (instruction.type === 'COMPLETE') {
    return 'Semua kategori covered — trigger output generation';
  }
  if (instruction.type === 'FOLLOW_UP') {
    return `Follow-up ${instruction.targetCategory} — butuh detail lebih`;
  }
  if (instruction.type === 'EXPLORE_CATEGORY' && instruction.targetCategory) {
    return `${instruction.targetCategory} belum covered`;
  }
  return categoriesRemaining.length > 0
    ? `${categoriesRemaining[0]} belum covered`
    : 'Semua kategori covered';
}

function mapInstructionType(type: string): GuidanceResult['instruction'] {
  switch (type) {
    case 'EXPLORE_CATEGORY':
    case 'SHORT_ANSWER_FOLLOW_UP':
    case 'LONG_MESSAGE_CONFIRM':
      return 'EXPLORE';
    case 'REDIRECT_ON_TOPIC':
    case 'CRISIS_HALT':
      return 'REDIRECT';
    case 'FOLLOW_UP':
      return 'FOLLOW_UP';
    case 'COMPLETE':
    case 'SESSION_CLOSE_OFFER':
      return 'COMPLETE';
    default: {
      console.warn(`[playground/prompt] Unknown instruction type: ${type}`);
      return 'EXPLORE';
    }
  }
}
