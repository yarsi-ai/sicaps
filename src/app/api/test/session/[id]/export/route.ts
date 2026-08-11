import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/db/prisma';
import { errorResponse, successResponse } from '@/lib/api/response';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/test/session/[id]/export
 *
 * Exports the full session data as comprehensive JSON.
 * Includes: all messages, all turn logs (with full prompts + LLM responses),
 * extractions, scoring state, session metadata, and audit logs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(errorResponse('VALIDATION_ERROR', 'Invalid session ID'), {
      status: 400,
    });
  }

  const sessionId = parsed.data.id;

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      demographics: true,
      messages: { orderBy: { createdAt: 'asc' } },
      turnLogs: { orderBy: { turnNumber: 'asc' } },
      extractions: { orderBy: { turnNumber: 'asc' } },
      screeningResults: true,
      checkpoint: true,
      evaluationFeedbacks: { orderBy: { turnNumber: 'asc' } },
    },
  });

  if (!session) {
    return NextResponse.json(errorResponse('NOT_FOUND', 'Session not found'), { status: 404 });
  }

  // Build comprehensive export
  const exportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      sessionId: session.id,
      source: session.source,
      promptVersion: session.promptVersion,
      scoringVersion: session.scoringVersion,
    },

    session: {
      id: session.id,
      locale: session.locale,
      mode: session.mode,
      status: session.status,
      phase: session.phase,
      turnCount: session.turnCount,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      expiresAt: session.expiresAt,
      // Coverage state
      dimensiTerisi: session.dimensiTerisi,
      dimensiBelum: session.dimensiBelum,
      // Binary scoring state
      scoringState: {
        gatalMalam: session.gatalMalam,
        kontakSerupa: session.kontakSerupa,
        lokasiKhas: session.lokasiKhas,
        asrama: session.asrama,
        tukarAlat: session.tukarAlat,
      },
      lokasiDetail: session.lokasiDetail,
      chipsAnswered: session.chipsAnswered,
      chipsSubState: session.chipsSubState,
      toneTheme: session.toneTheme,
      // Result fields
      riskLevel: session.riskLevel,
      perception: session.perception,
      hasilDitampilkan: session.hasilDitampilkan,
      partial: session.partial,
      // AI output
      aiConclusion: session.aiConclusion,
      aiPerceptionResponse: session.aiPerceptionResponse,
      aiRecommendation: session.aiRecommendation,
      aiSuggestion: session.aiSuggestion,
      metadata: session.metadata,
    },

    demographics: session.demographics
      ? {
          age: session.demographics.age,
          gender: session.demographics.gender,
          educationLevel: session.demographics.educationLevel,
        }
      : null,

    messages: session.messages.map((m) => ({
      role: m.role,
      content: m.content,
      isVoice: m.isVoice,
      createdAt: m.createdAt,
    })),

    turns: session.turnLogs.map((log) => {
      const extraction = session.extractions.find((e) => e.turnNumber === log.turnNumber);
      const feedback = session.evaluationFeedbacks.find((f) => f.turnNumber === log.turnNumber);

      // Parse rawResponse safely
      let parsedResponse: unknown = null;
      try {
        parsedResponse = JSON.parse(log.rawResponse);
      } catch {
        parsedResponse = log.rawResponse;
      }

      return {
        turnNumber: log.turnNumber,
        input: {
          userMessage: log.userMessage,
          systemPrompt: log.systemMessage,
        },
        output: {
          rawResponse: parsedResponse,
          parseStatus: log.parseStatus,
          parseError: log.parseError,
        },
        extraction: extraction
          ? {
              extraction: extraction.extraction,
              scores: extraction.scores,
            }
          : null,
        model: log.model,
        promptVersion: log.promptVersion,
        latencyMs: log.latencyMs,
        tokenUsage: log.tokenUsage,
        retryCount: log.retryCount,
        feedback: feedback
          ? {
              evaluatorType: feedback.evaluatorType,
              isAccurate: feedback.isAccurate,
              notes: feedback.notes,
            }
          : null,
        createdAt: log.createdAt,
      };
    }),

    result: session.screeningResults[0]
      ? {
          riskLevel: session.screeningResults[0].riskLevel,
          gejalaCount: session.screeningResults[0].gejalaCount,
          faktorCount: session.screeningResults[0].faktorCount,
          scoringState: session.screeningResults[0].scoringState,
          perception: session.screeningResults[0].perception,
          partial: session.screeningResults[0].partial,
          createdAt: session.screeningResults[0].createdAt,
        }
      : null,

    checkpoint: session.checkpoint
      ? {
          summary: session.checkpoint.summary,
          contextNote: session.checkpoint.contextNote,
        }
      : null,
  };

  return NextResponse.json(successResponse(exportData));
}
