const CRISIS_MARKERS = ['crisis', 'self-harm', 'bunuh diri', 'suicide', 'menyakiti diri'];

/**
 * Detects whether a system message indicates crisis handling was triggered.
 * Checks for known crisis-related markers in the message content.
 */
export function detectCrisis(systemMessage: string): boolean {
  const lower = systemMessage.toLowerCase();
  return CRISIS_MARKERS.some((marker) => lower.includes(marker));
}
