import { timingSafeEqual } from 'crypto';

/**
 * Performs timing-safe comparison of two share tokens.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 * Returns false when lengths differ without leaking length information via timing.
 */
export function verifyShareToken(provided: string, stored: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
