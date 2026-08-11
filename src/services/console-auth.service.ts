import {
  checkPinRateLimit,
  createSessionCookie,
  recordFailedPinAttempt,
  resetPinRateLimit,
  verifyPin,
} from '@/lib/console-auth';
import { env } from '@/lib/env';
import { InvalidPinError, RateLimitError, ValidationError } from '@/lib/errors';

export interface VerifyConsolePinInput {
  /** Client IP address, used as the rate-limit key. */
  ip: string;
  /** PIN value submitted by the visitor. */
  pin: string;
  /** Path to redirect to after successful verification. */
  redirect?: string;
}

export interface VerifyConsolePinResult {
  /** Path the visitor should be redirected to after verification. */
  redirect: string;
  /** Signed session cookie value to set on the response. */
  cookieValue: string;
}

/**
 * Orchestrates Console PIN verification: brute-force rate limiting,
 * timing-safe PIN comparison, and session cookie issuance.
 *
 * Throws `RateLimitError`, `ValidationError`, or `InvalidPinError` on failure.
 * The route handler catches these and maps them to the API response envelope.
 *
 * **Validates: Requirements 1.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 8.2, 8.3, 8.5**
 */
export function verifyConsolePin(input: VerifyConsolePinInput): VerifyConsolePinResult {
  const { ip, pin, redirect } = input;

  // Rate limit check happens before PIN comparison (Requirements 4.1, 4.2)
  const rateLimitResult = checkPinRateLimit(ip);
  if (!rateLimitResult.allowed) {
    throw new RateLimitError('Too many attempts. Please wait before trying again.');
  }

  // Empty/whitespace/missing PIN counts toward failed-attempt tracking (Requirement 3.3)
  if (!pin || pin.trim().length === 0) {
    recordFailedPinAttempt(ip);
    throw new ValidationError('PIN is required');
  }

  // Timing-safe comparison (Requirement 8.4); generic failure on mismatch (Req 3.1, 3.2, 8.5)
  if (!verifyPin(pin, env.CONSOLE_PIN)) {
    recordFailedPinAttempt(ip);
    throw new InvalidPinError();
  }

  // Correct PIN resets the failed-attempt counter (Requirement 4.3)
  resetPinRateLimit(ip);

  return {
    redirect: redirect || '/console',
    cookieValue: createSessionCookie(env.CONSOLE_PIN),
  };
}
