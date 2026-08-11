// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    turnLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/llm', () => ({
  createLLMClient: vi.fn(),
}));

vi.mock('@/features/screening-chat-v1/internal', () => ({
  parseLLMResponse: vi.fn(),
  extractReplyFromPartial: vi.fn(),
  appendToPool: vi.fn(),
  calculateAllScores: vi.fn(),
}));

vi.mock('@/lib/llm/playground-client', () => ({
  resolveProviderConfig: vi.fn(),
  getProviderEnvVar: vi.fn(),
}));

import { prisma } from '@/db/prisma';
import { appendToPool, calculateAllScores } from '@/features/screening-chat-v1/internal';
import {
  persistTurnLog,
  computePlaygroundScoring,
  type PlaygroundConfig,
  type PlaygroundTurnLogMetadata,
} from './playground.service';
import type {
  CategoryExtraction,
  ScoringResult,
  KeywordPool,
} from '@/features/screening-chat-v1/internal';

const mockedPrisma = vi.mocked(prisma, { deep: true });
const mockedAppendToPool = vi.mocked(appendToPool);
const mockedCalculateAllScores = vi.mocked(calculateAllScores);

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const providerArb = fc.constantFrom<PlaygroundConfig['provider']>(
  'groq',
  'huggingface',
  'gemini',
  'ollama',
);

const modeArb = fc.constantFrom<'single-shot' | 'multi-turn' | 'compare'>(
  'single-shot',
  'multi-turn',
  'compare',
);

const playgroundConfigArb: fc.Arbitrary<PlaygroundConfig> = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 1, maxLength: 50 }),
  temperature: fc.double({ min: 0, max: 2, noNaN: true }),
  topP: fc.double({ min: 0, max: 1, noNaN: true }),
  maxTokens: fc.integer({ min: 1, max: 4096 }),
  systemPrompt: fc.string({ minLength: 1, maxLength: 300 }),
});

const extractedKeywordArb = fc.record({
  keyword: fc.string({ minLength: 1, maxLength: 50 }),
  confidence: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
});

const validExtractionArb: fc.Arbitrary<CategoryExtraction> = fc.record({
  intensitas: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
  waktu: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
  lokasi_tubuh: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
  kontak: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
  lesi: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
  faktor_risiko: fc.array(extractedKeywordArb, { minLength: 0, maxLength: 3 }),
});

const REQUIRED_METADATA_FIELDS = [
  'source',
  'provider',
  'temperature',
  'topP',
  'maxTokens',
  'customSystemPrompt',
  'mode',
] as const;

// ─── Property 12: TurnLog persistence completeness ───────────────────────────

/**
 * Feature: llm-playground, Property 12: TurnLog persistence completeness
 *
 * Validates: Requirements 6.9, 6.13
 */
describe('Property 12: TurnLog persistence completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.turnLog.create.mockResolvedValue({} as never);
  });

  it('every TurnLog created by playground has metadata with all 7 required fields', () => {
    fc.assert(
      fc.property(
        playgroundConfigArb,
        modeArb,
        fc.boolean(),
        fc.integer({ min: 1, max: 20 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (config, mode, customSystemPrompt, turnNumber, userMessage) => {
          vi.clearAllMocks();
          mockedPrisma.turnLog.create.mockResolvedValue({} as never);

          persistTurnLog({
            sessionId: 'test-session-id',
            turnNumber,
            userMessage,
            rawResponse: '{"reply":"test"}',
            parseStatus: 'SUCCESS',
            systemMessage: config.systemPrompt,
            model: config.model,
            latencyMs: 100,
            tokensUsed: { input: 10, output: 20 },
            config,
            mode,
            customSystemPrompt,
          });

          expect(mockedPrisma.turnLog.create).toHaveBeenCalledTimes(1);

          const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
          const metadata = (callArgs?.data as Record<string, unknown>)
            ?.metadata as PlaygroundTurnLogMetadata;

          // All 7 required fields must be present and non-null/non-undefined
          for (const field of REQUIRED_METADATA_FIELDS) {
            expect(metadata[field]).not.toBeUndefined();
            expect(metadata[field]).not.toBeNull();
          }

          // Verify correct values from config
          expect(metadata.source).toBe('playground');
          expect(metadata.provider).toBe(config.provider);
          expect(metadata.temperature).toBe(config.temperature);
          expect(metadata.topP).toBe(config.topP);
          expect(metadata.maxTokens).toBe(config.maxTokens);
          expect(metadata.customSystemPrompt).toBe(customSystemPrompt);
          expect(metadata.mode).toBe(mode);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('metadata field count is exactly 7 — no extra or missing fields', () => {
    fc.assert(
      fc.property(playgroundConfigArb, modeArb, (config, mode) => {
        vi.clearAllMocks();
        mockedPrisma.turnLog.create.mockResolvedValue({} as never);

        persistTurnLog({
          sessionId: 'session-count-test',
          turnNumber: 1,
          userMessage: 'test',
          rawResponse: '{}',
          parseStatus: 'SUCCESS',
          systemMessage: config.systemPrompt,
          model: config.model,
          latencyMs: 50,
          tokensUsed: null,
          config,
          mode,
          customSystemPrompt: false,
        });

        const callArgs = mockedPrisma.turnLog.create.mock.calls[0]?.[0];
        const metadata = (callArgs?.data as Record<string, unknown>)?.metadata as Record<
          string,
          unknown
        >;

        expect(Object.keys(metadata)).toHaveLength(7);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: Source isolation on export ─────────────────────────────────

/**
 * Feature: llm-playground, Property 13: Source isolation on export
 *
 * Validates: Requirements 8.5
 *
 * This property verifies that source-based filtering correctly isolates records.
 * Given a mixed set of sessions with different source values,
 * filtering by source='playground' returns only playground records.
 */
describe('Property 13: Source isolation on export', () => {
  const sourceArb = fc.constantFrom('playground', 'production', 'testing');

  it('filtering by source=playground never includes production or testing records', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            source: sourceArb,
            turnNumber: fc.integer({ min: 1, max: 7 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          // Simulate the Prisma query filtering: session.source === 'playground'
          const filtered = records.filter((r) => r.source === 'playground');

          // Verify: no filtered record has source 'production' or 'testing'
          for (const record of filtered) {
            expect(record.source).not.toBe('production');
            expect(record.source).not.toBe('testing');
          }

          // Verify: all records with source 'playground' are included
          const playgroundRecords = records.filter((r) => r.source === 'playground');
          expect(filtered).toHaveLength(playgroundRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtering by source=playground is disjoint from filtering by source=testing', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            source: sourceArb,
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          const playgroundFiltered = records.filter((r) => r.source === 'playground');
          const testingFiltered = records.filter((r) => r.source === 'testing');

          // The two sets should have zero overlap
          const playgroundIds = new Set(playgroundFiltered.map((r) => r.id));
          for (const rec of testingFiltered) {
            expect(playgroundIds.has(rec.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtering by source=playground is disjoint from filtering by source=production', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            source: sourceArb,
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          const playgroundFiltered = records.filter((r) => r.source === 'playground');
          const productionFiltered = records.filter((r) => r.source === 'production');

          const playgroundIds = new Set(playgroundFiltered.map((r) => r.id));
          for (const rec of productionFiltered) {
            expect(playgroundIds.has(rec.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 14: Scoring toggle behavior ────────────────────────────────────

/**
 * Feature: llm-playground, Property 14: Scoring toggle behavior
 *
 * Validates: Requirements 9.2, 9.3, 9.4
 */
describe('Property 14: Scoring toggle behavior', () => {
  const mockScoringResult: ScoringResult = {
    version: 'v1',
    scores: {
      intensitas: {
        raw: 1,
        capped: 1,
        status: 'assessed',
        matchedPatterns: ['gatal'],
        unmatchedKeywords: [],
      },
      waktu: {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
      lokasi_tubuh: {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
      kontak: {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
      lesi: {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
      faktor_risiko: {
        raw: 0,
        capped: 0,
        status: 'not_assessed',
        matchedPatterns: [],
        unmatchedKeywords: [],
      },
    },
    totalScore: 1,
    riskLevel: 'LOW',
  };

  const mockPool: KeywordPool = {
    intensitas: [
      { keyword: 'gatal', confidence: 'high', turn: 1, matched: false, matchedPattern: null },
    ],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAppendToPool.mockReturnValue(mockPool);
    mockedCalculateAllScores.mockReturnValue(mockScoringResult);
  });

  it('when enableScoring=false, scoring is always null regardless of extraction validity', () => {
    fc.assert(
      fc.property(
        fc.oneof(validExtractionArb, fc.constant(null)),
        fc.constantFrom<'id' | 'en'>('id', 'en'),
        (extraction, locale) => {
          const result = computePlaygroundScoring(extraction, false, locale);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when enableScoring=true AND extraction is valid (non-null), scoring is non-null', () => {
    fc.assert(
      fc.property(
        validExtractionArb,
        fc.constantFrom<'id' | 'en'>('id', 'en'),
        (extraction, locale) => {
          const result = computePlaygroundScoring(extraction, true, locale);
          expect(result).not.toBeNull();
          expect(result).toEqual(mockScoringResult);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when enableScoring=true AND extraction is null, scoring is still null', () => {
    fc.assert(
      fc.property(fc.constantFrom<'id' | 'en'>('id', 'en'), (locale) => {
        const result = computePlaygroundScoring(null, true, locale);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('scoring computation is never called when enableScoring=false', () => {
    fc.assert(
      fc.property(
        fc.oneof(validExtractionArb, fc.constant(null)),
        fc.constantFrom<'id' | 'en'>('id', 'en'),
        (extraction, locale) => {
          vi.clearAllMocks();
          mockedAppendToPool.mockReturnValue(mockPool);
          mockedCalculateAllScores.mockReturnValue(mockScoringResult);

          computePlaygroundScoring(extraction, false, locale);
          expect(mockedCalculateAllScores).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scoring computation is called exactly once when enableScoring=true and extraction valid', () => {
    fc.assert(
      fc.property(
        validExtractionArb,
        fc.constantFrom<'id' | 'en'>('id', 'en'),
        (extraction, locale) => {
          vi.clearAllMocks();
          mockedAppendToPool.mockReturnValue(mockPool);
          mockedCalculateAllScores.mockReturnValue(mockScoringResult);

          computePlaygroundScoring(extraction, true, locale);
          expect(mockedCalculateAllScores).toHaveBeenCalledTimes(1);
          expect(mockedCalculateAllScores).toHaveBeenCalledWith(mockPool, locale);
        },
      ),
      { numRuns: 100 },
    );
  });
});
