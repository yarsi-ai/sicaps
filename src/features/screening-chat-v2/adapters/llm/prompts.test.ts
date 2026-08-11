/**
 * Unit tests for LLM prompt builders.
 *
 * Tests message array structure, state injection, checkpoint inclusion,
 * gatalMalam extraction guide, tone directive injection, and edukasi points.
 */

import { describe, it, expect } from 'vitest';
import {
  buildExtractMessages,
  buildComposeMessages,
  buildResultPrompt,
  type ChatMessage,
  type LLMMessage,
} from './prompts';
import type { ScoringState, RiskLevel, InstructionContext } from '../../domain/types';
import type { SessionSummary } from '../../domain/chat/checkpoint';
import { DEFAULT_SCORING_STATE } from '../../domain/chat/instruction';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEmptyState(): InstructionContext {
  return {
    phase: 'COLLECTING',
    dimensiTerisi: {},
    dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    turnCount: 0,
    locale: 'id',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
  };
}

function makePartialState(): InstructionContext {
  return {
    phase: 'COLLECTING',
    dimensiTerisi: {
      intensitas: { keywords: ['gatal malam hari'], negasi: [] },
      waktu: { keywords: ['lebih 2 minggu'], negasi: ['sudah sembuh'] },
    },
    dimensiBelum: ['lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    turnCount: 5,
    locale: 'id',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
  };
}

function makeCompleteState(): InstructionContext {
  return {
    phase: 'ASKING_PERCEPTION',
    dimensiTerisi: {
      intensitas: { keywords: ['gatal parah'], negasi: [] },
      waktu: { keywords: ['lebih 1 bulan'], negasi: [] },
      lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
      kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
      lesi: { keywords: ['bentol merah'], negasi: [] },
      faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
    },
    dimensiBelum: [],
    turnCount: 12,
    locale: 'id',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
  };
}

function makeSampleMessages(): ChatMessage[] {
  return [
    { role: 'assistant', content: 'Halo, ada yang bisa saya bantu?' },
    { role: 'user', content: 'Saya gatal-gatal di tangan sejak 2 minggu lalu.' },
    { role: 'assistant', content: 'Maaf mendengarnya. Gatalnya terasa di bagian mana saja?' },
    { role: 'user', content: 'Di sela-sela jari dan pergelangan tangan.' },
  ];
}

function makeCheckpoint(): SessionSummary {
  return {
    totalScore: 9,
    riskLevel: 'HIGH',
    perDimension: {
      intensitas: { keywords: ['gatal parah'], score: 3 },
      waktu: { keywords: ['lebih 2 minggu'], score: 3 },
      lokasi_tubuh: { keywords: ['sela jari'], score: 3 },
    },
    perception: 'underestimate',
    emosi: 'takut',
  };
}

// ---------------------------------------------------------------------------
// buildExtractMessages
// ---------------------------------------------------------------------------

describe('buildExtractMessages', () => {
  it('returns system message as first element', () => {
    const result = buildExtractMessages(makeEmptyState(), []);

    expect(result[0].role).toBe('system');
    expect(result[0].content.length).toBeGreaterThan(0);
  });

  it('includes extraction task description in system prompt', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('modul ekstraksi klinis');
  });

  it('includes current state context — empty state', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('belum ada');
    expect(systemContent).toContain('intensitas');
    expect(systemContent).toContain('faktor_risiko');
  });

  it('includes current state context — partial state', () => {
    const state = makePartialState();
    const result = buildExtractMessages(state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('intensitas');
    expect(systemContent).toContain('gatal malam hari');
    expect(systemContent).toContain('sudah sembuh');
    expect(systemContent).toContain('lokasi_tubuh');
  });

  it('includes JSON output format with schema example', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('dimensi');
    expect(systemContent).toContain('keywords');
    expect(systemContent).toContain('koreksi');
    expect(systemContent).toContain('emosi');
    expect(systemContent).toContain('unmapped');
  });

  it('includes extraction rules', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('pesan user');
    expect(systemContent).toContain('JSON');
    expect(systemContent).toContain('keyword');
  });

  it('appends recent messages after system prompt', () => {
    const messages = makeSampleMessages();
    const result = buildExtractMessages(makeEmptyState(), messages);

    expect(result.length).toBe(1 + messages.length);
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toBe('Halo, ada yang bisa saya bantu?');
    expect(result[2].role).toBe('user');
    expect(result[2].content).toContain('gatal-gatal');
    expect(result[4].role).toBe('user');
    expect(result[4].content).toContain('sela-sela jari');
  });

  it('preserves message order', () => {
    const messages = makeSampleMessages();
    const result = buildExtractMessages(makeEmptyState(), messages);

    const roles = result.slice(1).map((m) => m.role);
    expect(roles).toEqual(['assistant', 'user', 'assistant', 'user']);
  });

  it('handles empty recentMessages', () => {
    const result = buildExtractMessages(makeEmptyState(), []);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe('system');
  });

  it('includes valid dimension names in output format', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('intensitas');
    expect(systemContent).toContain('waktu');
    expect(systemContent).toContain('lokasi_tubuh');
    expect(systemContent).toContain('kontak');
    expect(systemContent).toContain('lesi');
    expect(systemContent).toContain('faktor_risiko');
  });
});

// ---------------------------------------------------------------------------
// buildComposeMessages
// ---------------------------------------------------------------------------

describe('buildComposeMessages', () => {
  it('returns system message as first element', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);

    expect(result[0].role).toBe('system');
    expect(result[0].content.length).toBeGreaterThan(0);
  });

  it('uses COLLECTING prompt for COLLECTING phase', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);
    const systemContent = result[0].content;

    // buildCollectingPrompt includes persona, dialogue policy, state section
    expect(systemContent).toContain('SICAPS');
    expect(systemContent).toContain('TOPIK PERTANYAAN YANG DIIZINKAN');
    expect(systemContent).toContain('DILARANG');
  });

  it('uses ASKING_PERCEPTION prompt for ASKING_PERCEPTION phase', () => {
    const state = makeCompleteState();
    const result = buildComposeMessages('ASKING_PERCEPTION', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('ringan');
    expect(systemContent).toContain('khawatir');
  });

  it('uses GREETING prompt for GREETING phase', () => {
    const state = makeEmptyState();
    state.phase = 'GREETING';
    const result = buildComposeMessages('GREETING', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('santri');
  });

  it('uses FOLLOW_UP prompt with checkpoint when provided', () => {
    const state = makeCompleteState();
    state.phase = 'FOLLOW_UP';
    const checkpoint = makeCheckpoint();
    const result = buildComposeMessages('FOLLOW_UP', state, [], checkpoint);
    const systemContent = result[0].content;

    // buildFollowUpPrompt includes checkpoint summary and risk level
    expect(systemContent).toContain('follow-up');
    expect(systemContent).toContain('HIGH');
  });

  it('falls back to generic prompt for FOLLOW_UP without checkpoint', () => {
    const state = makeCompleteState();
    state.phase = 'FOLLOW_UP';
    const result = buildComposeMessages('FOLLOW_UP', state, []);
    const systemContent = result[0].content;

    // Without checkpoint, falls through to buildComposePrompt which returns fallback
    expect(systemContent).toContain('FOLLOW_UP');
  });

  it('appends recent messages after system prompt', () => {
    const messages = makeSampleMessages();
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, messages);

    expect(result.length).toBe(1 + messages.length);
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('user');
  });

  it('preserves message order in compose', () => {
    const messages = makeSampleMessages();
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, messages);

    const roles = result.slice(1).map((m) => m.role);
    expect(roles).toEqual(['assistant', 'user', 'assistant', 'user']);
  });

  it('handles empty recentMessages', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);

    expect(result.length).toBe(1);
    expect(result[0].role).toBe('system');
  });

  it('includes forbidden topics in COLLECTING phase', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('DILARANG');
    expect(systemContent).toContain('PILIH SATU');
  });

  it('includes state injection in COLLECTING phase', () => {
    const state = makePartialState();
    const result = buildComposeMessages('COLLECTING', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('DILARANG');
    expect(systemContent).toContain('mengarang');
  });

  it('all messages have valid role types', () => {
    const messages = makeSampleMessages();
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, messages);

    for (const msg of result) {
      expect(['system', 'user', 'assistant']).toContain(msg.role);
      expect(msg.content.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildExtractMessages — gatalMalam extraction guide
// ---------------------------------------------------------------------------

describe('buildExtractMessages — compressed prompt (no gatalMalam)', () => {
  it('does NOT contain DETEKSI GATAL MALAM section (removed — derived in code)', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    expect(systemContent).not.toContain('DETEKSI GATAL MALAM');
  });

  it('does NOT contain gatalMalam in format output (removed from LLM schema)', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    // gatalMalam removed from output format and examples
    expect(systemContent).not.toContain('"gatalMalam"');
  });

  it('contains compressed Knowledge Base with flat lists', () => {
    const result = buildExtractMessages(makeEmptyState(), []);
    const systemContent = result[0].content;

    // Lokasi Tubuh is now a flat list
    expect(systemContent).toContain('sela jari, jari tangan, pergelangan');
    // Kontak is now a flat list
    expect(systemContent).toContain('teman sekamar, satu kamar, banyak yang gatal');
  });
});

// ---------------------------------------------------------------------------
// buildComposeMessages — tone directive injection
// ---------------------------------------------------------------------------

describe('buildComposeMessages — tone directive', () => {
  it('includes tone directive text when toneDirective option is provided', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, [], {
      toneDirective: 'GAYA BAHASA: Playful (SD)',
    });
    const systemContent = result[0].content;

    expect(systemContent).toContain('GAYA BAHASA: Playful (SD)');
  });

  it('does NOT contain GAYA BAHASA when toneDirective not provided', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);
    const systemContent = result[0].content;

    expect(systemContent).not.toContain('GAYA BAHASA');
  });

  it('injects tone directive for COLLECTING phase', () => {
    const state = makeEmptyState();
    state.phase = 'COLLECTING';
    const directive = 'GAYA BAHASA: Hybrid (SMP/SMA)';
    const result = buildComposeMessages('COLLECTING', state, [], { toneDirective: directive });
    const systemContent = result[0].content;

    expect(systemContent).toContain(directive);
    expect(systemContent).toContain('SICAPS');
  });

  it('injects tone directive for ASKING_PERCEPTION phase', () => {
    const state = makeCompleteState();
    state.phase = 'ASKING_PERCEPTION';
    const directive = 'GAYA BAHASA: Playful (SD)';
    const result = buildComposeMessages('ASKING_PERCEPTION', state, [], {
      toneDirective: directive,
    });
    const systemContent = result[0].content;

    expect(systemContent).toContain(directive);
    expect(systemContent).toContain('khawatir');
  });
});

// ---------------------------------------------------------------------------
// buildComposeMessages — edukasi points per risk level
// ---------------------------------------------------------------------------

describe('buildComposeMessages — edukasi per risk level', () => {
  it('contains "Segera temui kader santri atau dokter" for HIGH risk (≥2 gejala)', () => {
    const state: InstructionContext = {
      ...makeEmptyState(),
      phase: 'SCREENING_COMPLETE',
      scoringState: {
        gatalMalam: true,
        kontakSerupa: true,
        lokasiKhas: false,
        asrama: false,
        tukarAlat: false,
      },
    };
    const result = buildComposeMessages('SCREENING_COMPLETE', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('Segera temui kader santri atau dokter');
  });

  it('contains "Jika dalam 3 hari tidak membaik" for MODERATE risk (1 gejala + 1 faktor)', () => {
    const state: InstructionContext = {
      ...makeEmptyState(),
      phase: 'SCREENING_COMPLETE',
      scoringState: {
        gatalMalam: true,
        kontakSerupa: false,
        lokasiKhas: false,
        asrama: true,
        tukarAlat: false,
      },
    };
    const result = buildComposeMessages('SCREENING_COMPLETE', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('Jika dalam 3 hari tidak membaik');
  });

  it('contains "menjaga kebersihan diri dan kamar" but NOT "Segera temui" for LOW risk (0 gejala)', () => {
    const state: InstructionContext = {
      ...makeEmptyState(),
      phase: 'SCREENING_COMPLETE',
      scoringState: {
        gatalMalam: false,
        kontakSerupa: false,
        lokasiKhas: false,
        asrama: false,
        tukarAlat: false,
      },
    };
    const result = buildComposeMessages('SCREENING_COMPLETE', state, []);
    const systemContent = result[0].content;

    expect(systemContent).toContain('menjaga kebersihan diri dan kamar');
    expect(systemContent).not.toContain('Segera temui');
  });

  it('does NOT contain edukasi section for COLLECTING phase', () => {
    const state = makeEmptyState();
    const result = buildComposeMessages('COLLECTING', state, []);
    const systemContent = result[0].content;

    expect(systemContent).not.toContain('EDUKASI WAJIB');
    expect(systemContent).not.toContain('Segera temui kader santri atau dokter');
    expect(systemContent).not.toContain('Jika dalam 3 hari tidak membaik');
  });
});

// ---------------------------------------------------------------------------
// Type safety — compile-time checks
// ---------------------------------------------------------------------------

describe('type safety', () => {
  it('buildExtractMessages returns LLMMessage[]', () => {
    const result: LLMMessage[] = buildExtractMessages(makeEmptyState(), []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('buildComposeMessages returns LLMMessage[]', () => {
    const result: LLMMessage[] = buildComposeMessages('COLLECTING', makeEmptyState(), []);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildResultPrompt — result text generation prompt builder
// ---------------------------------------------------------------------------

describe('buildResultPrompt', () => {
  // Shared fixtures
  const sampleScoringState: ScoringState = {
    gatalMalam: true,
    kontakSerupa: true,
    lokasiKhas: false,
    asrama: true,
    tukarAlat: false,
  };

  const sampleDimensiTerisi: Record<string, { keywords: string[]; negasi: string[] }> = {
    intensitas: { keywords: ['parah', 'ga bisa tidur'], negasi: [] },
    waktu: { keywords: ['tiap malam'], negasi: [] },
    kontak: { keywords: ['teman sekamar'], negasi: [] },
  };

  const samplePerception = 'underestimate';
  const sampleRiskLevel: RiskLevel = 'HIGH';

  it('returns LLMMessage[] with system + user message', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      samplePerception,
      sampleRiskLevel,
      'id',
    );

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('user');
    expect(result[0].content.length).toBeGreaterThan(0);
    expect(result[1].content.length).toBeGreaterThan(0);
  });

  it('system prompt contains Indonesian directive when locale="id"', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      samplePerception,
      sampleRiskLevel,
      'id',
    );

    const systemContent = result[0].content;
    expect(systemContent).toContain('Bahasa Indonesia sederhana tingkat SMP');
  });

  it('system prompt contains English directive when locale="en"', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      samplePerception,
      sampleRiskLevel,
      'en',
    );

    const systemContent = result[0].content;
    expect(systemContent).toContain('Simple English');
  });

  it('user message contains JSON with scoringState, perception, riskLevel, dimensiTerisi', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      samplePerception,
      sampleRiskLevel,
      'id',
    );

    const userContent = result[1].content;
    const parsed = JSON.parse(userContent);

    expect(parsed.scoringState).toEqual(sampleScoringState);
    expect(parsed.perception).toBe(samplePerception);
    expect(parsed.riskLevel).toBe(sampleRiskLevel);
    expect(parsed.dimensiTerisi).toEqual(sampleDimensiTerisi);
  });

  it('pure function (no side effects)', () => {
    const state: ScoringState = { ...sampleScoringState };
    const dimensi = JSON.parse(JSON.stringify(sampleDimensiTerisi));
    const perception = samplePerception;
    const risk = sampleRiskLevel;

    buildResultPrompt(state, dimensi, perception, risk, 'id');

    // Verify inputs are not mutated
    expect(state).toEqual(sampleScoringState);
    expect(dimensi).toEqual(sampleDimensiTerisi);
  });

  it('system prompt contains JSON output format with 4 required fields', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      samplePerception,
      sampleRiskLevel,
      'id',
    );

    const systemContent = result[0].content;
    expect(systemContent).toContain('conclusion');
    expect(systemContent).toContain('perceptionResponse');
    expect(systemContent).toContain('recommendation');
    expect(systemContent).toContain('suggestion');
  });

  it('system prompt contains perception reference', () => {
    const result = buildResultPrompt(
      sampleScoringState,
      sampleDimensiTerisi,
      'barrier',
      sampleRiskLevel,
      'id',
    );

    const systemContent = result[0].content;
    expect(systemContent).toContain('barrier');
  });
});
