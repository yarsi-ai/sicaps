/**
 * LLM response parser.
 *
 * Parses and validates JSON extraction responses from the LLM.
 * Never throws — always returns a ParseResult discriminated union.
 */

import { ExtractionSchema, type RawExtraction } from './schemas';

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Parse raw JSON string from LLM extraction call and validate against schema.
 *
 * Steps: JSON.parse → Zod safeParse → ParseResult.
 * Never throws.
 */
export function parseExtraction(raw: string): ParseResult<RawExtraction> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      success: false,
      error: `JSON parse failed: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }

  const result = ExtractionSchema.safeParse(parsed);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error.message };
}

/**
 * Assemble streamed token chunks into a single reply string.
 *
 * Called after streaming is complete to get the full response text.
 */
export function extractReplyFromStream(chunks: string[]): string {
  return chunks.join('');
}

/**
 * Patterns that indicate meta-text / reasoning leaked into the compose output.
 * These lines should be stripped before sending to user.
 */
const META_TEXT_PATTERNS: readonly RegExp[] = [
  /^\s*[*\-•]\s*(Allowed|Check|Rule|Topic|Constraint|Output)/i,
  /^\s*=\s*\d+\s*sentence/i,
  /^\s*(Yes|No)\s*[.(]/,
  /^\s*\*\s*(Allowed topic|Single question|Pronoun check)/i,
  /^\s*---\s*(ATURAN|PENTING|RULES)/i,
  /^\s*\[?(constraint|check|rule|meta)\]?/i,
];

/**
 * Sanitize compose output by removing meta-text/reasoning lines.
 *
 * Some smaller LLMs (Llama, Qwen) occasionally output their internal
 * constraint-checking as visible text. This strips those lines while
 * preserving the actual chat reply.
 *
 * Returns sanitized string, or null if entire output was meta-text.
 */
export function sanitizeComposeOutput(raw: string): string | null {
  const lines = raw.split('\n');
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep empty lines (paragraph breaks)
    return !META_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed));
  });

  const result = cleaned.join('\n').trim();
  return result || null;
}
