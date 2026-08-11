import * as crypto from 'crypto';

/**
 * Compare submitted PIN against configured PIN using timing-safe comparison.
 * Returns true if PINs match exactly (case-sensitive, character-for-character).
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param submitted - The PIN value submitted by the user
 * @param configured - The configured CONSOLE_PIN value
 * @returns true if PINs match exactly, false otherwise
 */
export function verifyPin(submitted: string, configured: string): boolean {
  // Handle empty or whitespace-only submitted PINs
  if (!submitted || submitted.trim().length === 0) {
    return false;
  }

  // timingSafeEqual requires equal-length buffers.
  // To prevent length-based timing attacks, we use HMAC comparison instead.
  // This ensures constant-time comparison regardless of input lengths.
  const submittedHmac = crypto.createHmac('sha256', 'pin-compare').update(submitted).digest();
  const configuredHmac = crypto.createHmac('sha256', 'pin-compare').update(configured).digest();

  return crypto.timingSafeEqual(submittedHmac, configuredHmac);
}
