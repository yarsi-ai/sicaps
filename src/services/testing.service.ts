import { prisma } from '@/db/prisma';
import { CONFIG } from '@/lib/config';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { ScoringEndpointResponse } from '@/types';

/**
 * Fetches and shapes scoring data for a testing session.
 * Throws NotFoundError if session doesn't exist, ForbiddenError if not a testing session.
 */
export async function getSessionScoring(sessionId: string): Promise<ScoringEndpointResponse> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      demographics: true,
      turnLogs: { orderBy: { turnNumber: 'asc' } },
      extractions: { orderBy: { turnNumber: 'asc' } },
      evaluationFeedbacks: true,
    },
  });

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  if (session.source !== 'testing') {
    throw new ForbiddenError('Cannot access production session via test API');
  }

  // Build turns array joining all data per turn
  const turns = session.turnLogs.map((log) => {
    const ext = session.extractions.find((e) => e.turnNumber === log.turnNumber) ?? null;
    const feedback =
      session.evaluationFeedbacks.find((f) => f.turnNumber === log.turnNumber) ?? null;

    // Normalize extraction format: v2 stores { dimensi: { cat: { keywords, negasi } }, ... }
    // Console expects: { cat: [{ keyword, confidence }] }
    let normalizedExtraction: Record<
      string,
      Array<{ keyword: string; confidence: string | number }>
    > | null = null;
    let normalizedScores: Record<string, { score: number }> | null = null;

    if (ext) {
      const rawExtraction = ext.extraction as Record<string, unknown>;

      if (rawExtraction && 'dimensi' in rawExtraction) {
        // V2 format: { dimensi: { intensitas: { keywords: [...], negasi: [...] } } }
        const dimensi = rawExtraction.dimensi as Record<
          string,
          { keywords?: string[]; negasi?: string[] }
        >;
        normalizedExtraction = {};
        normalizedScores = {};

        for (const [cat, data] of Object.entries(dimensi)) {
          const keywords = data?.keywords ?? [];
          normalizedExtraction[cat] = keywords.map((kw) => ({
            keyword: kw,
            confidence: 'high',
          }));
          // Use scores from TurnExtraction if available, otherwise count keywords as proxy
          normalizedScores[cat] = { score: keywords.length > 0 ? 1 : 0 };
        }
      } else {
        // V1 format: { cat: [{ keyword, confidence }] } — pass through
        normalizedExtraction = rawExtraction as Record<
          string,
          Array<{ keyword: string; confidence: string | number }>
        >;
        normalizedScores = ext.scores as Record<string, { score: number }> | null;
      }
    }

    return {
      turnNumber: log.turnNumber,
      log: {
        ...log,
        tokenUsage: log.tokenUsage as { input: number; output: number } | null,
      },
      extraction: normalizedExtraction
        ? { extraction: normalizedExtraction, scores: normalizedScores }
        : null,
      feedback,
    };
  });

  const categoriesCovered = Array.isArray(session.categoriesCovered)
    ? (session.categoriesCovered as string[])
    : [];

  // V2: also consider dimensiTerisi keys as covered categories
  const v2Covered = session.dimensiTerisi
    ? Object.keys(session.dimensiTerisi as Record<string, unknown>)
    : [];
  const allCovered = [...new Set([...categoriesCovered, ...v2Covered])];

  const categoriesRemaining = [...CONFIG.scoringCategories].filter((c) => !allCovered.includes(c));

  return {
    session: {
      id: session.id,
      source: session.source,
      createdAt: session.createdAt,
      demographics: session.demographics,
      status: session.status,
      mode: session.mode,
      completedAt: session.completedAt ?? null,
      metadata: (session.metadata as Record<string, unknown>) ?? null,
      perception: session.perception ?? null,
      scores: (session.scores as Record<string, number>) ?? null,
      output: {
        conclusion: session.aiConclusion ?? null,
        perceptionResponse: session.aiPerceptionResponse ?? null,
        recommendation: session.aiRecommendation ?? null,
        suggestion: session.aiSuggestion ?? null,
      },
      // V2 binary scoring fields for console observability
      scoringState: {
        gatalMalam: ((session as Record<string, unknown>).gatalMalam as boolean) ?? false,
        kontakSerupa: ((session as Record<string, unknown>).kontakSerupa as boolean) ?? false,
        lokasiKhas: ((session as Record<string, unknown>).lokasiKhas as boolean) ?? false,
        asrama: ((session as Record<string, unknown>).asrama as boolean) ?? false,
        tukarAlat: ((session as Record<string, unknown>).tukarAlat as boolean) ?? false,
      },
      dimensiTerisi:
        ((session as Record<string, unknown>).dimensiTerisi as Record<
          string,
          { keywords: string[]; negasi: string[] }
        > | null) ?? null,
      dimensiBelum: ((session as Record<string, unknown>).dimensiBelum as string[]) ?? [],
      chipsAnswered: ((session as Record<string, unknown>).chipsAnswered as string[]) ?? [],
    },
    turns,
    scoring: {
      totalScore: session.totalScore,
      riskLevel: session.riskLevel,
      categoriesCovered: allCovered,
      categoriesRemaining,
    },
  };
}
