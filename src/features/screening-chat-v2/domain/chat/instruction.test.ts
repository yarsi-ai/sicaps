import { describe, it, expect } from 'vitest';
import {
  buildCollectingPrompt,
  buildPerceptionPrompt,
  buildFollowUpPrompt,
  buildComposePrompt,
  buildInstructionContext,
  DEFAULT_SCORING_STATE,
} from './instruction';
import type { InstructionContext } from '../types';
import type { SessionSummary } from './checkpoint';

describe('buildCollectingPrompt', () => {
  const baseState: InstructionContext = {
    phase: 'COLLECTING',
    dimensiTerisi: {
      intensitas: { keywords: ['gatal parah'], negasi: [] },
    },
    dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    turnCount: 5,
    locale: 'id',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
  };

  it('includes persona in prompt', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('SICAPS');
  });

  it('includes question-output rule', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('HARUS berupa pertanyaan singkat');
  });

  it('prohibits fabricating symptoms', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('mengarang');
  });

  it('includes target hint in prompt', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('TOPIK PERTANYAAN YANG DIIZINKAN');
  });

  it('includes remaining dimensions in state section', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('DILARANG');
  });

  it('targets first unfilled dimension', () => {
    const result = buildCollectingPrompt(baseState);

    // waktu is first non-chips dimension in baseState.dimensiBelum
    expect(result).toContain('kapan gatal');
  });

  it('includes target hint for waktu dimension', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('malam');
  });

  it('includes forbidden topics', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).toContain('DILARANG');
    expect(result).toContain('di luar daftar topik');
  });

  it('does not include guardrails section (removed for token optimization)', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).not.toContain('GUARDRAIL DIMENSI');
  });

  it('includes nudge instruction when shouldNudge is true', () => {
    const nudgeState: InstructionContext = { ...baseState, shouldNudge: true };
    const result = buildCollectingPrompt(nudgeState);

    expect(result).toContain('penyelesaian');
  });

  it('does not include nudge when shouldNudge is false', () => {
    const result = buildCollectingPrompt(baseState);

    expect(result).not.toContain('penyelesaian');
  });

  it('handles empty dimensiTerisi', () => {
    const emptyState: InstructionContext = {
      ...baseState,
      dimensiTerisi: {},
      dimensiBelum: ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    };
    const result = buildCollectingPrompt(emptyState);

    // intensitas is first non-chips dimension
    expect(result).toContain('parah');
  });

  it('handles empty dimensiBelum gracefully', () => {
    const allFilledState: InstructionContext = {
      ...baseState,
      dimensiTerisi: {
        intensitas: { keywords: ['gatal parah'], negasi: [] },
        waktu: { keywords: ['lebih 2 minggu'], negasi: [] },
        lokasi_tubuh: { keywords: ['sela jari'], negasi: [] },
        kontak: { keywords: ['teman sekamar gatal'], negasi: [] },
        lesi: { keywords: ['terowongan'], negasi: [] },
        faktor_risiko: { keywords: ['kamar padat'], negasi: [] },
      },
      dimensiBelum: [],
    };
    const result = buildCollectingPrompt(allFilledState);

    expect(result).not.toContain('GUARDRAIL DIMENSI');
  });
});

describe('buildPerceptionPrompt', () => {
  it('includes persona', () => {
    const result = buildPerceptionPrompt();

    expect(result).toContain('SICAPS');
  });

  it('includes dialogue policy', () => {
    const result = buildPerceptionPrompt();

    expect(result).toContain('SATU');
    expect(result).toContain('pertanyaan');
  });

  it('mentions perception question purpose', () => {
    const result = buildPerceptionPrompt();

    expect(result).toContain('serius');
  });

  it('includes example perception question', () => {
    const result = buildPerceptionPrompt();

    expect(result).toContain('ringan, mengganggu, atau bikin khawatir');
  });
});

describe('buildFollowUpPrompt', () => {
  const baseCheckpoint: SessionSummary = {
    totalScore: 9,
    riskLevel: 'HIGH',
    perDimension: {
      intensitas: { keywords: ['gatal parah'], score: 3 },
      waktu: { keywords: ['lebih 2 minggu'], score: 3 },
      kontak: { keywords: ['teman sekamar gatal'], score: 3 },
    },
    perception: 'underestimate',
    emosi: 'takut',
  };

  it('includes persona', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('SICAPS');
  });

  it('includes checkpoint risk level', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('HIGH');
  });

  it('includes checkpoint score', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('Tingkat risiko: HIGH');
  });

  it('includes checkpoint symptoms', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('gatal parah');
    expect(result).toContain('lebih 2 minggu');
  });

  it('includes checkpoint perception', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('underestimate');
  });

  it('includes checkpoint emosi when present', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('takut');
  });

  it('restricts answers to screening context only', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('kesehatan kulit');
  });

  it('prohibits medical diagnosis', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).toContain('merekomendasikan obat');
  });

  it('includes contextNote when provided', () => {
    const result = buildFollowUpPrompt(baseCheckpoint, 'id', 'Santri cemas tentang penularan');

    expect(result).toContain('Santri cemas tentang penularan');
  });

  it('omits contextNote section when not provided', () => {
    const result = buildFollowUpPrompt(baseCheckpoint);

    expect(result).not.toContain('cemas');
  });
});

describe('buildComposePrompt', () => {
  const baseState: InstructionContext = {
    phase: 'COLLECTING',
    dimensiTerisi: { intensitas: { keywords: ['gatal parah'], negasi: [] } },
    dimensiBelum: ['waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'],
    turnCount: 3,
    locale: 'id',
    shouldNudge: false,
    scoringState: DEFAULT_SCORING_STATE,
    chipsSubState: 'FREE_TEXT',
    toneTheme: 'hybrid',
  };

  it('routes COLLECTING to collecting prompt', () => {
    const result = buildComposePrompt('COLLECTING', baseState);

    expect(result).toContain('SICAPS');
    expect(result).toContain('PILIH SATU');
  });

  it('routes ASKING_PERCEPTION to perception prompt', () => {
    const result = buildComposePrompt('ASKING_PERCEPTION', baseState);

    expect(result).toContain('ringan');
    expect(result).toContain('mengganggu');
    expect(result).toContain('khawatir');
  });

  it('routes GREETING to greeting prompt', () => {
    const result = buildComposePrompt('GREETING', baseState);

    expect(result).toContain('santri');
  });

  it('routes OFFERING_RESULT to offering result prompt', () => {
    const result = buildComposePrompt('OFFERING_RESULT', baseState);

    expect(result).toContain('Skrining sudah selesai');
  });

  it('routes FOLLOW_UP to fallback prompt (needs checkpoint separately)', () => {
    const result = buildComposePrompt('FOLLOW_UP', baseState);

    expect(result).toContain('FOLLOW_UP');
  });

  it('routes CLOSED to fallback prompt', () => {
    const result = buildComposePrompt('CLOSED', baseState);

    expect(result).toContain('CLOSED');
  });

  it('routes SCREENING_COMPLETE to screening complete prompt', () => {
    const result = buildComposePrompt('SCREENING_COMPLETE', baseState);

    expect(result).toContain('SICAPS');
    expect(result).toContain('hasil skrining final');
  });

  it('routes AWAITING_IMAGE to fallback prompt', () => {
    const result = buildComposePrompt('AWAITING_IMAGE', baseState);

    expect(result).toContain('AWAITING_IMAGE');
  });

  it('always includes persona in all routes', () => {
    const phases = [
      'GREETING',
      'COLLECTING',
      'AWAITING_IMAGE',
      'ASKING_PERCEPTION',
      'OFFERING_RESULT',
      'FOLLOW_UP',
      'CLOSED',
    ] as const;

    for (const phase of phases) {
      const result = buildComposePrompt(phase, baseState);
      expect(result).toContain('SICAPS');
    }
  });
});

describe('buildInstructionContext', () => {
  it('populates all fields from complete session data', () => {
    const scoringState = {
      gatalMalam: true,
      kontakSerupa: false,
      lokasiKhas: true,
      asrama: false,
      tukarAlat: false,
    };

    const result = buildInstructionContext({
      phase: 'COLLECTING',
      dimensiTerisi: { intensitas: { keywords: ['gatal'], negasi: [] } },
      dimensiBelum: ['waktu', 'kontak'],
      turnCount: 4,
      locale: 'id',
      shouldNudge: false,
      scoringState,
      chipsSubState: 'CHIPS_ACTIVE',
      toneTheme: 'playful',
    });

    expect(result.phase).toBe('COLLECTING');
    expect(result.scoringState).toEqual(scoringState);
    expect(result.chipsSubState).toBe('CHIPS_ACTIVE');
    expect(result.toneTheme).toBe('playful');
    expect(result.turnCount).toBe(4);
    expect(result.locale).toBe('id');
  });

  it('defaults scoringState to all-false when not provided', () => {
    const result = buildInstructionContext({
      phase: 'COLLECTING',
      dimensiTerisi: {},
      dimensiBelum: ['intensitas'],
      turnCount: 1,
      locale: 'id',
      shouldNudge: false,
    });

    expect(result.scoringState).toEqual(DEFAULT_SCORING_STATE);
  });

  it('defaults chipsSubState to FREE_TEXT when not provided', () => {
    const result = buildInstructionContext({
      phase: 'COLLECTING',
      dimensiTerisi: {},
      dimensiBelum: ['intensitas'],
      turnCount: 1,
      locale: 'id',
      shouldNudge: false,
    });

    expect(result.chipsSubState).toBe('FREE_TEXT');
  });

  it('defaults toneTheme to hybrid when not provided', () => {
    const result = buildInstructionContext({
      phase: 'COLLECTING',
      dimensiTerisi: {},
      dimensiBelum: ['intensitas'],
      turnCount: 1,
      locale: 'id',
      shouldNudge: false,
    });

    expect(result.toneTheme).toBe('hybrid');
  });

  it('preserves non-default scoringState values', () => {
    const scoringState = {
      gatalMalam: true,
      kontakSerupa: true,
      lokasiKhas: false,
      asrama: true,
      tukarAlat: true,
    };

    const result = buildInstructionContext({
      phase: 'ASKING_PERCEPTION',
      dimensiTerisi: {
        intensitas: { keywords: ['gatal parah'], negasi: [] },
        waktu: { keywords: ['malam'], negasi: [] },
      },
      dimensiBelum: [],
      turnCount: 12,
      locale: 'en',
      shouldNudge: true,
      scoringState,
      chipsSubState: 'CHIPS_PENDING',
      toneTheme: 'playful',
    });

    expect(result.scoringState).toEqual(scoringState);
    expect(result.chipsSubState).toBe('CHIPS_PENDING');
    expect(result.toneTheme).toBe('playful');
    expect(result.shouldNudge).toBe(true);
    expect(result.locale).toBe('en');
  });
});
