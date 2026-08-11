import type { ChipsType } from '../types';
import { LOKASI_KHAS } from '../config';

export { LOKASI_KHAS } from '../config';

export interface ChipsAnswer {
  type: ChipsType;
  selections: string[];
  freeText?: string;
}

export interface ScoringUpdate {
  kontakSerupa?: boolean;
  lokasiKhas?: boolean;
  lokasiDetail?: string[];
  asrama?: boolean;
  tukarAlat?: boolean;
}

/**
 * Parse chips answer into scoring state update.
 *
 * Preconditions: answer.type matches active chips type
 * Postconditions: returns partial scoring state update
 */
export function parseChipsAnswer(answer: ChipsAnswer): ScoringUpdate {
  switch (answer.type) {
    case 'kontak':
      return { kontakSerupa: answer.selections[0] === 'true' };

    case 'lokasi': {
      const allLocations = [...answer.selections.filter((s) => s !== 'Lainnya')];
      if (answer.freeText) allLocations.push(answer.freeText);
      const hasKhas = answer.selections.some((s) => s !== 'Lainnya' && LOKASI_KHAS.includes(s));
      return { lokasiKhas: hasKhas, lokasiDetail: allLocations };
    }

    case 'asrama':
      return { asrama: answer.selections[0] === 'true' };

    case 'tukar_alat':
      return { tukarAlat: answer.selections[0] === 'true' };
  }
}

/**
 * Validate chips answer completeness.
 *
 * Returns null if valid, error message if invalid.
 */
export function validateChipsAnswer(answer: ChipsAnswer): string | null {
  switch (answer.type) {
    case 'kontak': {
      if (answer.selections.length !== 1) return 'Pilih satu jawaban';
      const selection = answer.selections[0];
      if (selection === undefined || !['true', 'false'].includes(selection))
        return 'Pilihan tidak valid';
      return null;
    }

    case 'lokasi':
      if (answer.selections.length === 0 && !answer.freeText) return 'Pilih minimal satu lokasi';
      return null;

    case 'asrama': {
      if (answer.selections.length !== 1) return 'Pilih satu jawaban';
      const selection = answer.selections[0];
      if (selection === undefined || !['true', 'false'].includes(selection))
        return 'Pilihan tidak valid';
      return null;
    }

    case 'tukar_alat': {
      if (answer.selections.length !== 1) return 'Pilih satu jawaban';
      const selection = answer.selections[0];
      if (selection === undefined || !['true', 'false'].includes(selection))
        return 'Pilihan tidak valid';
      return null;
    }
  }
}
