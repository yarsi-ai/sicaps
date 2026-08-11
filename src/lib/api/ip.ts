/**
 * Extracts the client IP address from request headers.
 * Checks `x-forwarded-for` (first IP in the chain), then `x-real-ip`,
 * falling back to `'127.0.0.1'` for local development.
 *
 * Accepts the standard Web API Headers interface (framework-agnostic).
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers.get('x-real-ip') ?? '127.0.0.1'
  );
}
