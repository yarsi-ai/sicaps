/**
 * Shared sliding-window rate limiter.
 *
 * Uses an in-memory Map of timestamp arrays per key.
 * Suitable for single-instance Vercel serverless — map resets on cold start (acceptable).
 * Reusable by any rate-limited endpoint (not LLM-specific).
 *
 * LIMITATION: Rate limits are enforced per-instance, not globally.
 * Under Vercel autoscaling, concurrent instances each maintain their own window.
 * For Phase 1 MVP with low traffic this is acceptable. For Phase 2+ with
 * multi-pesantren scale, consider replacing with Redis/Upstash shared counter.
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Unix epoch seconds when the oldest request in the window expires */
  resetAt: number;
  /** Seconds until the next request will be allowed (null if currently allowed) */
  retryAfterSeconds: number | null;
}

/** Internal store: key → array of request timestamps (ms) */
const windowStore = new Map<string, number[]>();

/** Maximum number of keys before triggering a cleanup sweep */
const MAX_KEYS_BEFORE_CLEANUP = 1000;

/** Remove expired entries from the store to prevent memory accumulation */
function pruneExpiredEntries(windowSeconds: number): void {
  const cutoff = Date.now() - windowSeconds * 1000;
  for (const [key, timestamps] of windowStore.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      windowStore.delete(key);
    } else {
      windowStore.set(key, active);
    }
  }
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * Sliding window approach:
 * - Filter out timestamps older than `windowSeconds` ago
 * - If count < maxRequests → allow, record timestamp
 * - If count >= maxRequests → reject, compute retryAfterSeconds
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  // Periodic cleanup to prevent memory accumulation
  if (windowStore.size > MAX_KEYS_BEFORE_CLEANUP) {
    pruneExpiredEntries(config.windowSeconds);
  }

  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const windowMs = config.windowSeconds * 1000;
  const cutoff = nowMs - windowMs;

  // Get existing timestamps and filter expired ones
  const existing = windowStore.get(key) ?? [];
  const active = existing.filter((ts) => ts > cutoff);

  if (active.length < config.maxRequests) {
    // Allow: add current timestamp
    active.push(nowMs);
    windowStore.set(key, active);

    const remaining = config.maxRequests - active.length;
    const earliest = active[0]!;
    const resetAt = Math.floor(earliest / 1000) + config.windowSeconds;

    return {
      allowed: true,
      remaining,
      limit: config.maxRequests,
      resetAt,
      retryAfterSeconds: null,
    };
  }

  // Reject: window is full
  windowStore.set(key, active);

  const earliest = active[0]!;
  const resetAt = Math.floor(earliest / 1000) + config.windowSeconds;
  const retryAfterSeconds = Math.max(1, resetAt - nowSeconds);

  return {
    allowed: false,
    remaining: 0,
    limit: config.maxRequests,
    resetAt,
    retryAfterSeconds,
  };
}

/**
 * Fail-open rate limit check. Wraps checkRateLimit in try/catch.
 * On error, allows the request through and logs a warning.
 * Route handlers should use this instead of checkRateLimit directly.
 */
export function safeCheckRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  try {
    return checkRateLimit(key, config);
  } catch (error) {
    console.warn('[rate-limiter] Unexpected error during rate limit check:', error);
    return {
      allowed: true,
      remaining: 0,
      limit: config.maxRequests,
      resetAt: 0,
      retryAfterSeconds: null,
    };
  }
}

/**
 * Build standard rate limit response headers from a RateLimitResult.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };
}

/**
 * Clear the rate limit store for a specific key.
 * Exposed for testing purposes.
 */
export function _resetRateLimitStore(key?: string): void {
  if (key) {
    windowStore.delete(key);
  } else {
    windowStore.clear();
  }
}
