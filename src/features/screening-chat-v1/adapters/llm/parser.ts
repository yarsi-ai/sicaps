import { llmChatResponseSchema, llmOutputResponseSchema } from './schemas';
import type { LLMChatResponse, LLMOutputResponse } from './schemas';

/** Discriminated result type for chat response parsing */
export type ParseResult =
  | { status: 'success'; data: LLMChatResponse }
  | { status: 'partial'; reply: string }
  | {
      status: 'failure';
      classification: 'json_parse_error' | 'schema_validation_error';
    };

/** Discriminated result type for output response parsing */
export type OutputParseResult =
  | { status: 'success'; data: LLMOutputResponse }
  | {
      status: 'failure';
      classification: 'json_parse_error' | 'schema_validation_error';
    };

/**
 * Parse accumulated LLM stream buffer into a validated chat response.
 *
 * Returns one of three variants:
 * - `success`: valid JSON + passes Zod schema → fully validated data
 * - `partial`: valid JSON + schema fails + reply field present (trimmed length ≥ 1) → reply string only
 * - `failure`: invalid JSON (json_parse_error) or schema fail without extractable reply (schema_validation_error)
 */
export function parseLLMResponse(buffer: string): ParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(buffer);
  } catch {
    return { status: 'failure', classification: 'json_parse_error' };
  }

  const result = llmChatResponseSchema.safeParse(parsed);

  if (result.success) {
    return { status: 'success', data: result.data };
  }

  // Schema validation failed — attempt partial recovery via reply field
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'reply' in parsed &&
    typeof (parsed as Record<string, unknown>).reply === 'string' &&
    ((parsed as Record<string, unknown>).reply as string).trim().length >= 1
  ) {
    return {
      status: 'partial',
      reply: (parsed as Record<string, unknown>).reply as string,
    };
  }

  return { status: 'failure', classification: 'schema_validation_error' };
}

/**
 * Parse accumulated LLM stream buffer into a validated output response.
 *
 * Returns one of two variants:
 * - `success`: valid JSON + passes Zod schema → fully validated data
 * - `failure`: invalid JSON (json_parse_error) or schema fail (schema_validation_error)
 */
export function parseOutputResponse(buffer: string): OutputParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(buffer);
  } catch {
    return { status: 'failure', classification: 'json_parse_error' };
  }

  const result = llmOutputResponseSchema.safeParse(parsed);

  if (result.success) {
    return { status: 'success', data: result.data };
  }

  return { status: 'failure', classification: 'schema_validation_error' };
}

/**
 * Attempt to extract `reply` field from malformed/partial JSON.
 * Used as last-resort recovery before degradation.
 *
 * Uses regex-based extraction to handle cases where JSON is truncated
 * or malformed but the reply field was already written.
 *
 * Returns the extracted reply string, or null if not recoverable.
 */
export function extractReplyFromPartial(buffer: string): string | null {
  // First try standard JSON parse — if it works, extract reply directly
  try {
    const parsed = JSON.parse(buffer);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'reply' in parsed &&
      typeof parsed.reply === 'string' &&
      parsed.reply.trim().length >= 1
    ) {
      return parsed.reply;
    }
  } catch {
    // JSON parse failed — fall through to regex extraction
  }

  // Regex-based extraction for malformed/truncated JSON
  // Matches "reply": "..." or "reply" : "..." handling escaped quotes within the value
  const replyPattern = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/;
  const match = buffer.match(replyPattern);

  if (match && match[1] !== undefined) {
    // Unescape the matched string (handle common JSON escape sequences)
    let extracted: string;
    try {
      extracted = JSON.parse(`"${match[1]}"`);
    } catch {
      // If unescape fails, use the raw matched value
      extracted = match[1];
    }

    if (extracted.trim().length >= 1) {
      return extracted;
    }
  }

  return null;
}
