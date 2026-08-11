/** SSE event types emitted to the client */
export type SSEEvent =
  | { event: 'token'; data: { content: string } }
  | { event: 'done'; data: DonePayload }
  | { event: 'error'; data: ErrorPayload };

export interface DonePayload {
  categoriesCovered: string[];
  isComplete: boolean;
  mode: 'ai' | 'questionnaire';
  result?: {
    totalScore: number;
    riskLevel: string;
    scores: Record<string, number>;
    conclusion: string;
    perceptionResponse: string | null;
    recommendation: string;
    personalizedSuggestion: string | null;
  };
  pills?: Array<{ id: string; label: string }>;
  pillSelection?: 'single' | 'multi';
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Encode a single SSE event into the text/event-stream wire format.
 * Format: `event: <type>\ndata: <json>\n\n`
 */
export function encodeSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Phase of the reply detector state machine.
 * - SCANNING: looking for the "reply" key at depth 1 (everything buffered)
 * - IN_REPLY: inside the reply string value (characters forwardable)
 * - PAST_REPLY: reply value ended (everything buffered)
 */
type Phase = 'scanning' | 'in_reply' | 'past_reply';

/**
 * Detect whether the current streaming position is inside the "reply" JSON value.
 * Used to decide whether to forward tokens to client or buffer silently.
 *
 * CONTRACT: Forwarded tokens represent raw JSON string characters, NOT rendered text.
 * JSON escape sequences (\n, \t, \", \\) are forwarded as-is (e.g., backslash + n).
 * The client MUST JSON-unescape the assembled token stream to get rendered text.
 * Example: if LLM produces "reply":"Hello\nWorld", client receives tokens: H,e,l,l,o,\,n,W,o,r,l,d
 * Client should join tokens and call JSON.parse('"' + joined + '"') to get "Hello\nWorld" with actual newline.
 *
 * Tracks JSON nesting depth and key names to determine when tokens belong
 * to the `reply` field value. Lightweight — just tracks brace/quote depth
 * and current key name, no full JSON parser needed.
 */
export function createReplyDetector(): {
  feed(token: string): { forwardable: string; buffered: string };
  isInsideReply(): boolean;
} {
  let phase: Phase = 'scanning';
  let depth = 0; // brace nesting depth
  let inString = false; // currently inside a JSON string
  let escaped = false; // next char is escaped (after backslash)
  let readingKey = false; // currently accumulating a key at depth 1
  let keyBuffer = ''; // accumulated key characters
  let expectColon = false; // just finished "reply" key, waiting for `:`
  let expectValueStart = false; // just saw `:` after "reply", waiting for `"`

  function processChar(ch: string): 'forward' | 'buffer' {
    // Handle escape sequences inside strings
    if (escaped) {
      escaped = false;
      if (phase === 'in_reply') {
        return 'forward';
      }
      return 'buffer';
    }

    if (inString && ch === '\\') {
      escaped = true;
      if (phase === 'in_reply') {
        return 'forward';
      }
      return 'buffer';
    }

    // Currently inside the reply value string
    if (phase === 'in_reply') {
      if (ch === '"') {
        // End of reply string value
        inString = false;
        phase = 'past_reply';
        return 'buffer';
      }
      return 'forward';
    }

    // Past the reply — buffer everything
    if (phase === 'past_reply') {
      // Still need to track string state for correctness, but never forward
      if (inString) {
        if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
      }
      return 'buffer';
    }

    // SCANNING phase: looking for "reply" key at depth 1
    if (inString) {
      if (ch === '"') {
        // End of a string
        inString = false;
        if (readingKey) {
          readingKey = false;
          // Check if the key we just read is "reply"
          if (keyBuffer === 'reply' && depth === 1) {
            expectColon = true;
          }
          keyBuffer = '';
        }
      } else if (readingKey) {
        keyBuffer += ch;
      }
      return 'buffer';
    }

    // Not in a string
    if (ch === '"') {
      inString = true;
      if (expectValueStart) {
        // This is the opening quote of the reply value
        expectValueStart = false;
        phase = 'in_reply';
        return 'buffer'; // The quote itself is not forwardable
      }
      if (expectColon) {
        // Unexpected: got quote before colon, reset
        expectColon = false;
      }
      // Check if this starts a key at depth 1
      if (depth === 1 && !expectColon) {
        readingKey = true;
        keyBuffer = '';
      }
      return 'buffer';
    }

    if (ch === ':') {
      if (expectColon) {
        expectColon = false;
        expectValueStart = true;
      }
      return 'buffer';
    }

    if (ch === '{') {
      depth++;
      expectColon = false;
      expectValueStart = false;
      return 'buffer';
    }

    if (ch === '}') {
      depth--;
      expectColon = false;
      expectValueStart = false;
      return 'buffer';
    }

    if (ch === '[' || ch === ']') {
      expectColon = false;
      expectValueStart = false;
      return 'buffer';
    }

    // Whitespace and other characters
    // If we're expecting a colon or value start, whitespace is fine (skip over it)
    // For non-string values after "reply": (shouldn't happen — reply is always a string)
    if (expectValueStart && ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
      // Non-string value for reply key — unexpected, treat as past reply
      expectValueStart = false;
      phase = 'past_reply';
    }

    return 'buffer';
  }

  return {
    feed(token: string): { forwardable: string; buffered: string } {
      let forwardable = '';
      let buffered = '';

      for (const ch of token) {
        const result = processChar(ch);
        if (result === 'forward') {
          forwardable += ch;
        } else {
          buffered += ch;
        }
      }

      return { forwardable, buffered };
    },

    isInsideReply(): boolean {
      return phase === 'in_reply';
    },
  };
}
