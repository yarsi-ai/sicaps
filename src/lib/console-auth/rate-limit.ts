/**
 * PIN-specific rate limiter for console authentication.
 *
 * Uses an in-memory Map of timestamp arrays per IP address.
 * Follows the same sliding-window approach as lib/rate-limiter.ts but
 * with separate storage and PIN-specific configuration.
 *
 * Key differences from general rate-limiter:
 * - Tracks failed PIN attempts only (not all requests)
 * - Provides reset functionality on successful PIN submission
 * - Default config from CONFIG.console.PIN_RATE_LIMIT
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import { CONFIG } from '../config';

export interface PinRateLimitConfig {
  /** Maximum failed attempts before lockout. Default: 5 */
  maxAttempts: number;
  /** Time window in seconds from first failed attempt. Default: 900 (15 minutes) */
  windowSeconds: number;
}

export interface PinRateLimitResult {
  /** Whether the IP is allowed to attempt PIN entry */
  allowed: boolean;
  /** Number of remaining attempts in the current window */
  remaining: number;
  /** Unix timestamp (seconds) when the window resets */
  resetAt: number;
}

/**
 * Internal store: IP address → array of failed attempt timestamps (milliseconds)
 *
 * We store timestamps of failed attempts only. The window is measured from
 * the first failed attempt in the window.
 */
const pinAttemptStore = new Map<string, number[]>();

/** Maximum number of keys before triggering a cleanup sweep */
const MAX_KEYS_BEFORE_CLEANUP = 1000;

/**
 * Get default config from CONFIG.console.PIN_RATE_LIMIT.
 * Extracted for testability.
 */
function getDefaultConfig(): PinRateLimitConfig {
  return {
    maxAttempts: CONFIG.console.PIN_RATE_LIMIT.maxAttempts,
    windowSeconds: CONFIG.console.PIN_RATE_LIMIT.windowSeconds,
  };
}

/**
 * Remove expired entries from the store to prevent memory accumulation.
 */
function pruneExpiredEntries(windowSeconds: number): void {
  const cutoff = Date.now() - windowSeconds * 1000;
  for (const [key, timestamps] of pinAttemptStore.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      pinAttemptStore.delete(key);
    } else {
      pinAttemptStore.set(key, active);
    }
  }
}

/**
 * Check if an IP address is allowed to attempt PIN entry.
 *
 * Sliding window approach:
 * - Filter out timestamps older than `windowSeconds` ago
 * - If count < maxAttempts → allowed
 * - If count >= maxAttempts → blocked until oldest entry expires
 *
 * Note: This function does NOT record a new attempt. The caller should
 * call `recordFailedPinAttempt` after a failed PIN submission.
 *
 * @param ip - The client's IP address
 * @param config - Optional config override (defaults to CONFIG.console.PIN_RATE_LIMIT)
 * @returns Rate limit result with allowed status and remaining attempts
 *
 * **Validates: Requirements 4.1, 4.2**
 */
export function checkPinRateLimit(
  ip: string,
  config?: Partial<PinRateLimitConfig>,
): PinRateLimitResult {
  const finalConfig = { ...getDefaultConfig(), ...config };

  // Periodic cleanup to prevent memory accumulation
  if (pinAttemptStore.size > MAX_KEYS_BEFORE_CLEANUP) {
    pruneExpiredEntries(finalConfig.windowSeconds);
  }

  const nowMs = Date.now();
  const windowMs = finalConfig.windowSeconds * 1000;
  const cutoff = nowMs - windowMs;

  // Get existing timestamps and filter expired ones
  const existing = pinAttemptStore.get(ip) ?? [];
  const active = existing.filter((ts) => ts > cutoff);

  // Update store with filtered timestamps
  if (active.length > 0) {
    pinAttemptStore.set(ip, active);
  } else {
    pinAttemptStore.delete(ip);
  }

  if (active.length < finalConfig.maxAttempts) {
    // Allowed: IP has not exceeded attempt limit
    const remaining = finalConfig.maxAttempts - active.length;
    const resetAt =
      active.length > 0
        ? Math.floor(active[0]! / 1000) + finalConfig.windowSeconds
        : Math.floor(nowMs / 1000) + finalConfig.windowSeconds;

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  // Blocked: IP has reached the attempt limit
  const earliest = active[0]!;
  const resetAt = Math.floor(earliest / 1000) + finalConfig.windowSeconds;

  return {
    allowed: false,
    remaining: 0,
    resetAt,
  };
}

/**
 * Record a failed PIN attempt for the given IP address.
 *
 * Should be called after a failed PIN submission.
 *
 * @param ip - The client's IP address
 * @param config - Optional config override for window calculation
 */
export function recordFailedPinAttempt(ip: string, config?: Partial<PinRateLimitConfig>): void {
  const finalConfig = { ...getDefaultConfig(), ...config };

  const nowMs = Date.now();
  const windowMs = finalConfig.windowSeconds * 1000;
  const cutoff = nowMs - windowMs;

  // Get existing timestamps and filter expired ones
  const existing = pinAttemptStore.get(ip) ?? [];
  const active = existing.filter((ts) => ts > cutoff);

  // Add new attempt timestamp
  active.push(nowMs);
  pinAttemptStore.set(ip, active);
}

/**
 * Reset rate limit for an IP address.
 *
 * Called on successful PIN submission to clear the failed attempt counter.
 *
 * @param ip - The client's IP address
 *
 * **Validates: Requirement 4.3**
 */
export function resetPinRateLimit(ip: string): void {
  pinAttemptStore.delete(ip);
}

/**
 * Clear the entire rate limit store.
 * Exposed for testing purposes only.
 *
 * @internal
 */
export function _resetPinAttemptStore(): void {
  pinAttemptStore.clear();
}

/**
 * Get the current store size.
 * Exposed for testing purposes only.
 *
 * @internal
 */
export function _getStoreSize(): number {
  return pinAttemptStore.size;
}
