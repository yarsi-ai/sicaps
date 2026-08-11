import { NextRequest, NextResponse } from 'next/server';

import { AppError } from '@/lib/errors';
import { errorResponse, successResponse } from '@/lib/api/response';
import { processPlaygroundChat } from '@/services/playground.service';
import type { PlaygroundConfig, PlaygroundOptions } from '@/services/playground.service';

import { playgroundChatRequestSchema } from './schema';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = playgroundChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      errorResponse('VALIDATION_ERROR', 'Validation failed', [parsed.error.flatten().fieldErrors]),
      { status: 400 },
    );
  }

  const {
    provider,
    model,
    temperature,
    topP,
    maxTokens,
    systemPrompt,
    messages,
    enableScoring,
    locale,
    sessionId,
    mode,
  } = parsed.data;

  const config: PlaygroundConfig = { provider, model, temperature, topP, maxTokens, systemPrompt };
  const options: PlaygroundOptions = { enableScoring, locale, sessionId, mode };

  try {
    const result = await processPlaygroundChat(config, messages, options);
    return NextResponse.json(successResponse(result));
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(errorResponse(error.code, error.message), {
        status: error.statusCode,
      });
    }
    return NextResponse.json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'), {
      status: 500,
    });
  }
}
