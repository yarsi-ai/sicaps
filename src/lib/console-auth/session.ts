import * as crypto from 'crypto';
import { CONFIG } from '../config';

/**
 * Session cookie payload structure.
 * Contains timestamps for session creation and expiration.
 */
export interface ConsoleSessionCookie {
  /** Unix timestamp (seconds) when session was created */
  iat: number;
  /** Unix timestamp (seconds) when session expires (iat + 24h) */
  exp: number;
}

/**
 * Create a signed session cookie value.
 * Cookie format: <base64(payload)>.<hmac-signature>
 *
 * @param secret - Server secret for HMAC signing (derived from CONSOLE_PIN)
 * @returns Signed cookie string
 */
export function createSessionCookie(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const durationSeconds = CONFIG.console.SESSION_DURATION_HOURS * 60 * 60;

  const payload: ConsoleSessionCookie = {
    iat: now,
    exp: now + durationSeconds,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Parse and validate session cookie.
 * Returns the decoded payload if valid, null if invalid/expired/malformed.
 *
 * @param cookie - The cookie value to validate
 * @param secret - Server secret for HMAC verification
 * @returns Decoded session payload, or null if invalid
 */
export function validateSessionCookie(cookie: string, secret: string): ConsoleSessionCookie | null {
  // Must have exactly two parts separated by '.'
  const parts = cookie.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const payloadBase64 = parts[0]!;
  const providedSignature = parts[1]!;

  // Verify signature using timing-safe comparison
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  // Use timing-safe comparison to prevent timing attacks on signature
  const signaturesMatch = timingSafeCompare(providedSignature, expectedSignature);
  if (!signaturesMatch) {
    return null;
  }

  // Decode and parse payload
  let payload: ConsoleSessionCookie;
  try {
    const decoded = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    payload = JSON.parse(decoded) as ConsoleSessionCookie;
  } catch {
    return null;
  }

  // Validate payload structure
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  // Check expiration
  if (isSessionExpired(payload)) {
    return null;
  }

  return payload;
}

/**
 * Check if session is expired (24h absolute expiry).
 *
 * @param session - Session payload to check
 * @returns true if session has expired, false otherwise
 */
export function isSessionExpired(session: ConsoleSessionCookie): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= session.exp;
}

/**
 * Timing-safe string comparison using HMAC.
 * Prevents timing attacks by ensuring comparison time is constant regardless of input.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const aHmac = crypto.createHmac('sha256', 'sig-compare').update(a).digest();
  const bHmac = crypto.createHmac('sha256', 'sig-compare').update(b).digest();
  return crypto.timingSafeEqual(aHmac, bHmac);
}
