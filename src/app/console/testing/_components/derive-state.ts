export type DisplayState =
  | 'IDLE'
  | 'GREETING'
  | 'COLLECTING'
  | 'ASKING_PERCEPTION'
  | 'OFFERING_RESULT'
  | 'SCREENING_COMPLETE'
  | 'FOLLOW_UP'
  | 'CLOSED'
  | 'COMPLETED';

/**
 * Derives the display state for the testing console status badge.
 *
 * Uses V2 phase directly when available, falls back to V1 derivation logic.
 */
export function deriveDisplayState(
  status: string | null,
  categoriesCovered: string[],
  metadata: Record<string, unknown> | null,
  turnsCount?: number,
  phase?: string | null,
): DisplayState {
  // V2: use phase directly if available
  if (phase) {
    const validPhases: DisplayState[] = [
      'GREETING',
      'COLLECTING',
      'ASKING_PERCEPTION',
      'OFFERING_RESULT',
      'SCREENING_COMPLETE',
      'FOLLOW_UP',
      'CLOSED',
    ];
    if (validPhases.includes(phase as DisplayState)) {
      return phase as DisplayState;
    }
  }

  // V1 fallback
  if (status === 'COMPLETED') return 'COMPLETED';
  if (categoriesCovered.length >= 6) return 'COLLECTING';
  if (turnsCount === 0) return 'IDLE';
  return 'COLLECTING';
}
