/**
 * Guards against the model leaking its own planning text into a chat reply.
 *
 * Distinct from truncation: these replies come back with `finish_reason: "stop"`
 * and a complete sentence, but carry extra text the user should never see —
 * a leading checklist, a described emoji, or a stray word tacked on after the
 * final sentence (observed as `"...on the itchy parts of your skin? rash"`).
 *
 * Pure predicates — no I/O.
 */

/** Meta-text / reasoning leaked into the head of the reply instead of chat text. */
const META_TEXT_LEAK = /^\s*[*\-•=]|^\s*(Yes|No|Check|Rule|Allowed)\b/i;

/**
 * The literal word "emoji" never belongs in a chat reply — it means the model
 * described the emoji it was asked to add instead of emitting one.
 */
const EMOJI_MENTION = /\bemoji\b/i;

/** Trailing emoji, variation selectors, ZWJ and whitespace. */
const TRAILING_DECORATION = /[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/gu;

/** Strip trailing emoji and whitespace, which are legitimate reply endings. */
function stripTrailingDecoration(text: string): string {
  return text.replace(TRAILING_DECORATION, '');
}

/**
 * Detect a stray fragment appended after the reply's final sentence.
 *
 * Trailing emoji are stripped first, since `"...at night? 🌙"` is the intended
 * shape and must not be flagged. A reply whose last sentence ends the string
 * cleanly passes, however many sentences it contains.
 */
export function hasTrailingLeak(reply: string): boolean {
  const trimmed = stripTrailingDecoration(reply.trim());
  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('?'),
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
  );
  if (lastSentenceEnd === -1) return false;

  const tail = stripTrailingDecoration(trimmed.slice(lastSentenceEnd + 1)).trim();
  return tail.length > 0;
}

/** Meta-text leaked at the start of the reply. */
export function hasLeadingLeak(reply: string): boolean {
  return META_TEXT_LEAK.test(reply.trim());
}

/** Reply names an emoji instead of writing one. */
export function mentionsEmoji(reply: string): boolean {
  return EMOJI_MENTION.test(reply);
}

/**
 * Reply is unusable and should be retried rather than shown to the user.
 */
export function isLeakedReply(reply: string): boolean {
  return hasLeadingLeak(reply) || mentionsEmoji(reply) || hasTrailingLeak(reply);
}
