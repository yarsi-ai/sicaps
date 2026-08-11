/**
 * Per-dimension guardrails for LLM system prompt injection.
 *
 * Aligned with Appendix A.6 of design.md.
 * One-liner format: TANYAKAN / DILARANG per dimension.
 *
 * Content is in Indonesian — injected directly into prompts.
 */

import type { DimensionName } from '../types';

export interface DimensionGuardrail {
  mustAsk: string;
  mustNotAsk: string;
}

export const DIMENSION_GUARDRAILS: Record<DimensionName, DimensionGuardrail> = {
  intensitas: {
    mustAsk: 'seberapa parah gatal',
    mustNotAsk: 'skala 1-10, nyeri, alergi',
  },
  waktu: {
    mustAsk: 'kapan paling terasa (pola waktu)',
    mustNotAsk: 'sejak kapan mulai, musim',
  },
  lokasi_tubuh: {
    mustAsk: 'bagian tubuh yang gatal/kelainan',
    mustNotAsk: 'apakah menyebar, leading',
  },
  kontak: {
    mustAsk: 'ada orang sekitar dengan keluhan serupa',
    mustNotAsk: 'kontak intim, hewan',
  },
  lesi: {
    mustAsk: 'seperti apa kelainan kulit',
    mustNotAsk: 'warna spesifik, minta foto',
  },
  faktor_risiko: {
    mustAsk: 'kondisi lingkungan (padat, berbagi barang)',
    mustNotAsk: 'riwayat keluarga, makanan',
  },
};
