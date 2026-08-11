export type InstructionType = 'EXPLORE' | 'FOLLOW_UP' | 'COMPLETE' | 'REDIRECT';

export interface ParsedInstruction {
  type: InstructionType;
  target: string | null;
  isFollowUp: boolean;
}

const VALID_TYPES: ReadonlySet<string> = new Set(['EXPLORE', 'FOLLOW_UP', 'COMPLETE', 'REDIRECT']);

const MARKER = '[TURN GUIDANCE]';

/**
 * Parse [TURN GUIDANCE] marker from a system message.
 * Returns null if marker not found (graceful fallback for older sessions).
 */
export function parseInstruction(systemMessage: string): ParsedInstruction | null {
  const markerIndex = systemMessage.indexOf(MARKER);
  if (markerIndex === -1) return null;

  const afterMarker = systemMessage.slice(markerIndex + MARKER.length);
  const lines = afterMarker.split('\n');

  let type: string | null = null;
  let target: string | null = null;
  let isFollowUp = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Stop parsing if we hit the next section marker
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) break;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    switch (key) {
      case 'instruction':
        type = value.toUpperCase();
        break;
      case 'target':
        target = value || null;
        break;
      case 'follow-up':
        isFollowUp = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
    }
  }

  if (!type || !VALID_TYPES.has(type)) return null;

  return {
    type: type as InstructionType,
    target,
    isFollowUp,
  };
}
