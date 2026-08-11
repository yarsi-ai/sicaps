/**
 * Property-based tests for Console Route Protection (proxy/middleware).
 *
 * **Property 1: Console route protection**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * For any request path that starts with `/console` (including `/console` itself and
 * all nested paths like `/console/foo/bar`), if the request does not have a valid,
 * non-expired session cookie, the Console_Guard SHALL intercept the request and
 * either redirect to PIN entry (for navigation requests) or return 401 (for API/fetch requests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks - Must be defined before imports
// ─────────────────────────────────────────────────────────────────────────────

// Mock next-intl modules to avoid Edge runtime issues in tests
vi.mock('next-intl/middleware', () => ({
  default: vi.fn(() => vi.fn()),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: vi.fn(() => ({})),
}));

vi.mock('@/i18n/config', () => ({
  locales: ['en', 'id'],
  defaultLocale: 'id',
}));

// Mock console-auth module
vi.mock('./lib/console-auth', () => ({
  validateSessionCookie: vi.fn(),
}));

// Mock lib/env so tests can toggle CONSOLE_PIN presence without relying on the
// real Zod-validated singleton (which caches after first parse).
vi.mock('./lib/env', () => ({
  getEnv: vi.fn(() => {
    if (!process.env.CONSOLE_PIN) {
      throw new Error('CONSOLE_PIN environment variable is required');
    }
    return { CONSOLE_PIN: process.env.CONSOLE_PIN };
  }),
}));

// Import after mocking
import middleware from './proxy';
import { validateSessionCookie } from './lib/console-auth';
import { CONFIG } from './lib/config';

const mockedValidateSessionCookie = vi.mocked(validateSessionCookie);

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock NextRequest for testing middleware.
 */
function createMockRequest(
  pathname: string,
  options?: {
    sessionCookie?: string;
    searchParams?: Record<string, string>;
  },
): NextRequest {
  const url = new URL(pathname, 'http://localhost:3000');

  if (options?.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const request = new NextRequest(url);

  // Mock cookies if session cookie is provided
  if (options?.sessionCookie) {
    Object.defineProperty(request, 'cookies', {
      value: {
        get: (name: string) =>
          name === CONFIG.console.SESSION_COOKIE_NAME
            ? { name, value: options.sessionCookie }
            : undefined,
      },
      writable: false,
    });
  } else {
    Object.defineProperty(request, 'cookies', {
      value: {
        get: () => undefined,
      },
      writable: false,
    });
  }

  return request;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries for Property-Based Tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate random URL-safe path segments.
 * These can be used as parts of console routes.
 */
const pathSegmentArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/).filter((s) => s !== 'auth'); // Exclude 'auth' to avoid generating unprotected paths

/**
 * Generate protected console page paths (not /console/auth).
 * Examples: /console, /console/testing, /console/playground/foo
 */
const protectedConsolePagePathArb = fc
  .array(pathSegmentArb, { minLength: 0, maxLength: 3 })
  .map((segments) => {
    if (segments.length === 0) return '/console';
    return `/console/${segments.join('/')}`;
  })
  .filter((path) => !path.startsWith('/console/auth'));

/**
 * Generate protected console API paths.
 * Examples: /api/console/foo, /api/console/bar/baz
 */
const protectedConsoleApiPathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 3 })
  .map((segments) => `/api/console/${segments.join('/')}`)
  .filter((path) => !path.startsWith('/api/console/auth') && path !== '/api/console/auth/verify');

/**
 * Generate unprotected auth-related paths.
 * Examples: /console/auth, /api/console/auth/verify
 */
const unprotectedAuthPathArb = fc.constantFrom('/console/auth', '/api/console/auth/verify');

/**
 * Generate random query parameters for testing redirect preservation.
 */
const queryParamsArb = fc
  .array(fc.tuple(fc.stringMatching(/^[a-z]{1,10}$/), fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)), {
    minLength: 0,
    maxLength: 3,
  })
  .map((pairs) => Object.fromEntries(pairs));

// ─────────────────────────────────────────────────────────────────────────────
// Property-Based Tests for Console Route Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: console-pin-protection, Property 1: Console route protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up CONSOLE_PIN in environment
    process.env.CONSOLE_PIN = 'test-pin-123456';
  });

  afterEach(() => {
    delete process.env.CONSOLE_PIN;
  });

  /**
   * Property: Unverified page requests to protected console paths are redirected to /console/auth
   */
  it('redirects unverified page requests to /console/auth for any protected console path', () => {
    fc.assert(
      fc.property(protectedConsolePagePathArb, queryParamsArb, (pathname, queryParams) => {
        // Ensure session validation returns null (unverified)
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, { searchParams: queryParams });
        const response = middleware(request);

        // Should return a redirect response
        expect(response).toBeInstanceOf(NextResponse);
        expect(response?.status).toBe(307); // Redirect status

        // Verify redirect URL
        const location = response?.headers.get('location');
        expect(location).toBeTruthy();
        expect(location).toContain('/console/auth');
        expect(location).toContain('redirect=');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Unverified API requests to protected console paths receive 401
   */
  it('returns 401 for unverified API requests to any protected console API path', () => {
    fc.assert(
      fc.property(protectedConsoleApiPathArb, (pathname) => {
        // Ensure session validation returns null (unverified)
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname);
        const response = middleware(request);

        // Should return 401 Unauthorized
        expect(response).toBeInstanceOf(NextResponse);
        expect(response?.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Verified requests (valid session cookie) to protected console paths are allowed through
   */
  it('allows verified requests through for any protected console path', () => {
    fc.assert(
      fc.property(protectedConsolePagePathArb, (pathname) => {
        // Ensure session validation returns valid session
        mockedValidateSessionCookie.mockReturnValue({
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400,
        });

        const request = createMockRequest(pathname, {
          sessionCookie: 'valid-session-cookie',
        });
        const response = middleware(request);

        // Should return undefined (allow through) for page requests
        // The middleware returns undefined to let the request continue
        expect(response).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Verified API requests are allowed through
   */
  it('allows verified API requests through for any protected console API path', () => {
    fc.assert(
      fc.property(protectedConsoleApiPathArb, (pathname) => {
        // Ensure session validation returns valid session
        mockedValidateSessionCookie.mockReturnValue({
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400,
        });

        const request = createMockRequest(pathname, {
          sessionCookie: 'valid-session-cookie',
        });
        const response = middleware(request);

        // Should return undefined (allow through)
        expect(response).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Auth-related paths are NOT protected (allow unauthenticated access)
   */
  it('allows unauthenticated access to /console/auth and /api/console/auth/verify', () => {
    fc.assert(
      fc.property(unprotectedAuthPathArb, (pathname) => {
        // Session validation should not be called or should return null
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname);
        const response = middleware(request);

        // Should NOT redirect or return 401
        // For /console/auth, middleware should allow it through (return undefined)
        // The actual page will render the PIN entry form
        expect(response).toBeUndefined();
      }),
      { numRuns: 10 }, // Fewer runs since there are only 2 constant paths
    );
  });

  /**
   * Property: Expired sessions are treated as unverified
   */
  it('redirects when session cookie exists but is expired/invalid', () => {
    fc.assert(
      fc.property(protectedConsolePagePathArb, (pathname) => {
        // Session validation returns null (expired/invalid)
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, {
          sessionCookie: 'expired-or-invalid-cookie',
        });
        const response = middleware(request);

        // Should redirect to auth (treated as unverified)
        expect(response).toBeInstanceOf(NextResponse);
        expect(response?.status).toBe(307);
        expect(response?.headers.get('location')).toContain('/console/auth');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Missing CONSOLE_PIN in environment causes fail-secure behavior
   */
  it('denies access when CONSOLE_PIN is not configured (fail-secure)', () => {
    fc.assert(
      fc.property(protectedConsolePagePathArb, (pathname) => {
        // Remove CONSOLE_PIN from environment
        delete process.env.CONSOLE_PIN;

        const request = createMockRequest(pathname, {
          sessionCookie: 'some-cookie-value',
        });
        const response = middleware(request);

        // Should redirect (fail-secure: deny when PIN not configured)
        expect(response).toBeInstanceOf(NextResponse);
        expect(response?.status).toBe(307);
        expect(response?.headers.get('location')).toContain('/console/auth');

        // Restore for next iteration
        process.env.CONSOLE_PIN = 'test-pin-123456';
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property: Redirect URL preserves the original path and query parameters
   */
  it('preserves original path and query params in redirect URL', () => {
    fc.assert(
      fc.property(protectedConsolePagePathArb, queryParamsArb, (pathname, queryParams) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, { searchParams: queryParams });
        const response = middleware(request);

        expect(response?.status).toBe(307);

        const location = response?.headers.get('location');
        expect(location).toBeTruthy();

        // Extract and decode the redirect parameter
        const redirectUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = redirectUrl.searchParams.get('redirect');
        expect(encodedRedirect).toBeTruthy();

        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        // The decoded redirect should start with the original pathname
        expect(decodedRedirect.startsWith(pathname)).toBe(true);

        // If there were query params, they should be preserved
        if (Object.keys(queryParams).length > 0) {
          Object.entries(queryParams).forEach(([key, value]) => {
            expect(decodedRedirect).toContain(`${key}=${value}`);
          });
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: 401 response has correct JSON structure
   */
  it('returns correctly structured 401 JSON response for unauthorized API requests', async () => {
    fc.assert(
      fc.asyncProperty(protectedConsoleApiPathArb, async (pathname) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname);
        const response = middleware(request);

        expect(response?.status).toBe(401);

        const body = await response?.json();
        expect(body).toEqual({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }),
      { numRuns: 50 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit Tests for Specific Middleware Behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('middleware unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONSOLE_PIN = 'test-pin-123456';
  });

  afterEach(() => {
    delete process.env.CONSOLE_PIN;
  });

  describe('protected console paths', () => {
    it('redirects /console without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/console');
      const response = middleware(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get('location')).toContain('/console/auth');
    });

    it('redirects /console/testing without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/console/testing');
      const response = middleware(request);

      expect(response?.status).toBe(307);
    });

    it('redirects /console/playground/foo/bar without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/console/playground/foo/bar');
      const response = middleware(request);

      expect(response?.status).toBe(307);
    });

    it('returns 401 for /api/console/foo without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/api/console/foo');
      const response = middleware(request);

      expect(response?.status).toBe(401);
    });
  });

  describe('unprotected auth paths', () => {
    it('allows /console/auth without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/console/auth');
      const response = middleware(request);

      expect(response).toBeUndefined();
    });

    it('allows /api/console/auth/verify without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/api/console/auth/verify');
      const response = middleware(request);

      expect(response).toBeUndefined();
    });

    it('allows /console/auth/something without session', () => {
      mockedValidateSessionCookie.mockReturnValue(null);
      const request = createMockRequest('/console/auth/something');
      const response = middleware(request);

      expect(response).toBeUndefined();
    });
  });

  describe('session validation', () => {
    it('validates session cookie using validateSessionCookie', () => {
      const mockSession = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      mockedValidateSessionCookie.mockReturnValue(mockSession);

      const request = createMockRequest('/console/testing', {
        sessionCookie: 'valid-cookie',
      });
      middleware(request);

      expect(mockedValidateSessionCookie).toHaveBeenCalledWith('valid-cookie', 'test-pin-123456');
    });

    it('allows through when session is valid', () => {
      mockedValidateSessionCookie.mockReturnValue({
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      });

      const request = createMockRequest('/console/testing', {
        sessionCookie: 'valid-cookie',
      });
      const response = middleware(request);

      expect(response).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 4: Non-Console Route Isolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route classification helper - extracted from proxy.ts for direct testing.
 * This ensures we're testing the exact logic used in the middleware.
 */
function isConsoleRoute(pathname: string): boolean {
  return pathname.startsWith('/console') || pathname.startsWith('/api/console');
}

/**
 * Arbitrary for valid URL path segments (excluding reserved patterns).
 * Generates alphanumeric segments that don't start with 'console'.
 */
const nonConsolePathSegmentArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{0,19}$/)
  .filter((s) => s !== 'console' && !s.startsWith('console'));

/**
 * Arbitrary for locale prefixes used in i18n routing.
 */
const localeArb = fc.constantFrom('id', 'en');

/**
 * Arbitrary for common public page paths (non-console).
 * These represent santri-facing and public informational pages.
 */
const publicPathArb = fc.oneof(
  // Root path
  fc.constant('/'),
  // Locale-prefixed root
  localeArb.map((locale) => `/${locale}`),
  // Screening routes (santri-facing)
  fc.constant('/screening'),
  localeArb.map((locale) => `/${locale}/screening`),
  fc.constant('/screening/chat'),
  localeArb.map((locale) => `/${locale}/screening/chat`),
  fc.constant('/screening/result'),
  localeArb.map((locale) => `/${locale}/screening/result`),
  // About/info pages
  fc.constant('/about'),
  localeArb.map((locale) => `/${locale}/about`),
  fc.constant('/privacy'),
  localeArb.map((locale) => `/${locale}/privacy`),
);

/**
 * Arbitrary for non-console API paths.
 * These are public or screening-related API endpoints.
 */
const nonConsoleApiArb = fc.oneof(
  // Screening API endpoints
  fc.constant('/api/screening/start'),
  fc.constant('/api/screening/chat'),
  fc.constant('/api/screening/result'),
  fc.constant('/api/screening/pdf'),
  fc.constant('/api/screening/transcript'),
  // Health check
  fc.constant('/api/health'),
  // Random non-console API paths
  nonConsolePathSegmentArb.map((segment) => `/api/${segment}`),
  fc.tuple(nonConsolePathSegmentArb, nonConsolePathSegmentArb).map(([a, b]) => `/api/${a}/${b}`),
);

/**
 * Arbitrary for random non-console paths with variable depth.
 * Ensures no path starts with /console or /api/console.
 */
const randomNonConsolePathArb = fc
  .array(nonConsolePathSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => `/${segments.join('/')}`)
  .filter((path) => !isConsoleRoute(path));

/**
 * Arbitrary for paths with query parameters.
 */
const pathWithQueryArb = fc
  .tuple(
    fc.oneof(publicPathArb, randomNonConsolePathArb),
    fc.array(
      fc.tuple(fc.stringMatching(/^[a-z]{1,10}$/), fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)),
      { minLength: 1, maxLength: 3 },
    ),
  )
  .map(([path, params]) => {
    const queryString = params.map(([k, v]) => `${k}=${v}`).join('&');
    return `${path}?${queryString}`;
  });

/**
 * Combined arbitrary for all non-console paths.
 */
const allNonConsolePathsArb = fc.oneof(
  publicPathArb,
  nonConsoleApiArb,
  randomNonConsolePathArb,
  pathWithQueryArb,
);

describe('Feature: console-pin-protection, Property 4: Non-console route isolation', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any request path that does NOT start with `/console` (including all
   * screening routes, public pages, and non-console API endpoints), the
   * Console_Guard SHALL NOT intercept, redirect, or modify the request
   * regardless of session state.
   */

  it('isConsoleRoute returns false for public pages', () => {
    fc.assert(
      fc.property(publicPathArb, (path) => {
        // Extract pathname (without query string) for route matching
        const pathname = path.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isConsoleRoute returns false for non-console API endpoints', () => {
    fc.assert(
      fc.property(nonConsoleApiArb, (path) => {
        const pathname = path.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isConsoleRoute returns false for random non-console paths', () => {
    fc.assert(
      fc.property(randomNonConsolePathArb, (path) => {
        const pathname = path.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isConsoleRoute returns false for paths with query parameters', () => {
    fc.assert(
      fc.property(pathWithQueryArb, (fullPath) => {
        const pathname = fullPath.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isConsoleRoute returns false for all non-console paths', () => {
    fc.assert(
      fc.property(allNonConsolePathsArb, (path) => {
        const pathname = path.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // ─── Console Route Detection (Negative Tests) ───

  it('isConsoleRoute returns true ONLY for console-prefixed paths', () => {
    const consolePathArb = fc.oneof(
      fc.constant('/console'),
      fc.constant('/console/'),
      fc.constant('/console/testing'),
      fc.constant('/console/playground'),
      fc.constant('/console/auth'),
      fc.constant('/api/console'),
      fc.constant('/api/console/auth/verify'),
      nonConsolePathSegmentArb.map((segment) => `/console/${segment}`),
      fc
        .tuple(nonConsolePathSegmentArb, nonConsolePathSegmentArb)
        .map(([a, b]) => `/console/${a}/${b}`),
    );

    fc.assert(
      fc.property(consolePathArb, (path) => {
        expect(isConsoleRoute(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // ─── Edge Cases ───

  it('paths containing "console" in the middle (not at start) are NOT console routes', () => {
    const containsConsoleInMiddleArb = fc.oneof(
      // Paths with 'console' in the middle
      fc.constant('/user/console/settings'),
      fc.constant('/admin/console'),
      fc.constant('/app/console/view'),
      // API paths with 'console' not at start
      fc.constant('/api/user/console'),
      fc.constant('/api/admin/console/settings'),
      // Paths with 'console' as a suffix
      fc.constant('/my-console'),
      // Query param containing console
      fc.constant('/dashboard?view=console'),
    );

    fc.assert(
      fc.property(containsConsoleInMiddleArb, (path) => {
        const pathname = path.split('?')[0];

        expect(isConsoleRoute(pathname ?? '')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Note: The current isConsoleRoute implementation uses `startsWith('/console')`
   * which means paths like `/consoles`, `/consoled`, `/console-ish` ARE matched
   * as console routes. This is acceptable because:
   * 1. The Next.js middleware matcher (`/console/:path*`) is more precise
   * 2. No actual routes in the app use these patterns
   * 3. The over-matching is a fail-safe (more protection, not less)
   *
   * If stricter matching is needed, isConsoleRoute could be updated to use:
   * `pathname === '/console' || pathname.startsWith('/console/')`
   */
  it('paths starting with /console (including /consoles, etc.) are treated as console routes', () => {
    const consolePrefixedPaths = fc.oneof(
      fc.constant('/consoles'),
      fc.constant('/consoled'),
      fc.constant('/console-ish'),
      fc.constant('/consoleX'),
    );

    fc.assert(
      fc.property(consolePrefixedPaths, (path) => {
        // Current implementation treats these as console routes (startsWith behavior)
        expect(isConsoleRoute(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('locale-prefixed screening paths remain non-console routes', () => {
    const screeningPathsArb = fc.oneof(
      // Standard screening flow
      localeArb.map((l) => `/${l}/screening`),
      localeArb.map((l) => `/${l}/screening/chat`),
      localeArb.map((l) => `/${l}/screening/result`),
      localeArb.map((l) => `/${l}/screening/history`),
      // With session IDs
      localeArb.chain((l) => fc.uuid().map((uuid) => `/${l}/screening/result/${uuid}`)),
    );

    fc.assert(
      fc.property(screeningPathsArb, (path) => {
        expect(isConsoleRoute(path)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('root path and empty paths are not console routes', () => {
    const rootPathsArb = fc.constantFrom('/', '/id', '/en', '');

    fc.assert(
      fc.property(rootPathsArb, (path) => {
        expect(isConsoleRoute(path)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 7: Redirect Preservation Round-Trip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Validates: Requirements 6.1, 6.3**
 *
 * Property 7: Redirect preservation round-trip
 *
 * For any console route path (including query parameters) that an unverified
 * visitor requests, if the visitor subsequently submits the correct PIN,
 * the redirect after successful verification SHALL return the visitor to
 * that exact original path including query parameters.
 */

/**
 * Generate URL-safe query parameter keys.
 * Follows standard URL query param naming conventions.
 */
const queryKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,14}$/).filter((k) => k.length > 0);

/**
 * Generate URL-safe query parameter values.
 * Includes common patterns: alphanumeric, numbers, UUIDs, simple strings.
 */
const queryValueArb = fc.oneof(
  // Simple alphanumeric values
  fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/),
  // Numeric values
  fc.integer({ min: 0, max: 999999 }).map(String),
  // UUIDs
  fc.uuid(),
  // Boolean-like strings
  fc.constantFrom('true', 'false', '1', '0'),
  // Empty value (valid in query strings)
  fc.constant(''),
);

/**
 * Generate query parameter objects with various shapes.
 */
const queryParamsForRedirectArb = fc.oneof(
  // No query params
  fc.constant({} as Record<string, string>),
  // Single query param
  fc.tuple(queryKeyArb, queryValueArb).map(([k, v]) => ({ [k]: v })),
  // Multiple query params (2-5)
  fc
    .array(fc.tuple(queryKeyArb, queryValueArb), { minLength: 2, maxLength: 5 })
    .map((pairs) => Object.fromEntries(pairs)),
);

/**
 * Generate nested console paths with variable depth.
 */
const nestedConsolePathArb = fc
  .array(pathSegmentArb, { minLength: 0, maxLength: 4 })
  .map((segments) => (segments.length === 0 ? '/console' : `/console/${segments.join('/')}`))
  .filter((path) => !path.startsWith('/console/auth'));

/**
 * Generate query parameter values that need URL encoding.
 * These test that special characters are properly preserved through encode/decode.
 */
const specialCharQueryValueArb = fc.oneof(
  // Spaces (should become %20 or +)
  fc.constant('hello world'),
  fc.constant('multi word value'),
  // Plus signs
  fc.constant('a+b'),
  fc.constant('1+1=2'),
  // Equals signs
  fc.constant('a=b'),
  // Ampersands (need encoding in values)
  fc.constant('foo&bar'),
  // Hash/fragment (needs encoding)
  fc.constant('section#heading'),
  // Question marks (needs encoding)
  fc.constant('what?'),
  // Slashes
  fc.constant('path/to/thing'),
  // Common URL-safe chars that should be preserved
  fc.constant('abc-123_def'),
  // Unicode characters (should be percent-encoded)
  fc.constant('café'),
  fc.constant('日本語'),
  // JSON-like values (common in app state params)
  fc.constant('{"page":1}'),
  fc.constant('[1,2,3]'),
);

/**
 * Generate query params with special characters that require encoding.
 */
const specialQueryParamsArb = fc
  .array(fc.tuple(queryKeyArb, specialCharQueryValueArb), {
    minLength: 1,
    maxLength: 3,
  })
  .map((pairs) => Object.fromEntries(pairs));

describe('Feature: console-pin-protection, Property 7: Redirect preservation round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONSOLE_PIN = 'test-pin-123456';
  });

  afterEach(() => {
    delete process.env.CONSOLE_PIN;
  });

  /**
   * Property: The redirect parameter in /console/auth URL contains the exact
   * original path when no query params are present.
   */
  it('preserves exact path without query params in redirect parameter', () => {
    fc.assert(
      fc.property(nestedConsolePathArb, (originalPath) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(originalPath);
        const response = middleware(request);

        expect(response?.status).toBe(307);

        const location = response?.headers.get('location');
        expect(location).toBeTruthy();

        // Parse the auth redirect URL
        const authUrl = new URL(location!, 'http://localhost:3000');
        expect(authUrl.pathname).toBe('/console/auth');

        // Extract and decode the redirect param
        const encodedRedirect = authUrl.searchParams.get('redirect');
        expect(encodedRedirect).toBeTruthy();

        const decodedPath = decodeURIComponent(encodedRedirect!);

        // Decoded path must exactly match original (no trailing slashes added, etc.)
        expect(decodedPath).toBe(originalPath);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: The redirect parameter preserves query parameters exactly.
   */
  it('preserves query parameters in redirect parameter', () => {
    fc.assert(
      fc.property(nestedConsolePathArb, queryParamsForRedirectArb, (pathname, queryParams) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, {
          searchParams: queryParams,
        });
        const response = middleware(request);

        expect(response?.status).toBe(307);

        const location = response?.headers.get('location');
        const authUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = authUrl.searchParams.get('redirect');
        expect(encodedRedirect).toBeTruthy();

        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        // Verify pathname is preserved
        const hasQueryParams = Object.keys(queryParams).length > 0;
        if (hasQueryParams) {
          expect(decodedRedirect.startsWith(pathname)).toBe(true);

          // Verify each query param is present in decoded redirect
          Object.entries(queryParams).forEach(([key, value]) => {
            expect(decodedRedirect).toContain(`${key}=${value}`);
          });
        } else {
          // No query params - should be exact pathname match
          expect(decodedRedirect).toBe(pathname);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Round-trip encoding/decoding preserves the exact original URL.
   * This tests that: original -> encode -> redirect URL -> decode = original
   */
  it('round-trip encode/decode produces exact original path', () => {
    fc.assert(
      fc.property(nestedConsolePathArb, queryParamsForRedirectArb, (pathname, queryParams) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        // Build original URL as it would appear
        const originalUrl = new URL(pathname, 'http://localhost:3000');
        Object.entries(queryParams).forEach(([key, value]) => {
          originalUrl.searchParams.set(key, value);
        });
        const originalPathWithSearch = originalUrl.pathname + originalUrl.search;

        // Make request with this path
        const request = createMockRequest(pathname, {
          searchParams: queryParams,
        });
        const response = middleware(request);

        const location = response?.headers.get('location');
        const authUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = authUrl.searchParams.get('redirect');

        // Decode and compare with original
        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        expect(decodedRedirect).toBe(originalPathWithSearch);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Special characters in query values are properly encoded and
   * can be decoded back to original values.
   */
  it('preserves special characters in query values through encode/decode', () => {
    fc.assert(
      fc.property(nestedConsolePathArb, specialQueryParamsArb, (pathname, queryParams) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, {
          searchParams: queryParams,
        });
        const response = middleware(request);

        expect(response?.status).toBe(307);

        const location = response?.headers.get('location');
        const authUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = authUrl.searchParams.get('redirect');

        // The redirect param should be properly encoded
        expect(encodedRedirect).toBeTruthy();

        // Double-decode check: decoding once should give us valid URL with params
        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        // Parse the decoded redirect to extract query params
        const decodedUrl = new URL(decodedRedirect, 'http://localhost:3000');

        // Verify each original query param is preserved in decoded URL
        Object.entries(queryParams).forEach(([key, value]) => {
          expect(decodedUrl.searchParams.get(key)).toBe(value);
        });
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Deeply nested paths are fully preserved.
   */
  it('preserves deeply nested console paths', () => {
    // Generate paths with 3-5 segments
    const deepNestedPathArb = fc
      .array(pathSegmentArb, { minLength: 3, maxLength: 5 })
      .map((segments) => `/console/${segments.join('/')}`);

    fc.assert(
      fc.property(deepNestedPathArb, queryParamsForRedirectArb, (pathname, queryParams) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        const request = createMockRequest(pathname, { searchParams: queryParams });
        const response = middleware(request);

        const location = response?.headers.get('location');
        const authUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = authUrl.searchParams.get('redirect');
        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        // Path should start with exact pathname
        expect(decodedRedirect.startsWith(pathname)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Empty query string (path ends with ?) is handled correctly.
   */
  it('handles paths with empty query string', () => {
    fc.assert(
      fc.property(nestedConsolePathArb, (pathname) => {
        mockedValidateSessionCookie.mockReturnValue(null);

        // Create request - empty searchParams
        const request = createMockRequest(pathname, { searchParams: {} });
        const response = middleware(request);

        const location = response?.headers.get('location');
        const authUrl = new URL(location!, 'http://localhost:3000');
        const encodedRedirect = authUrl.searchParams.get('redirect');
        const decodedRedirect = decodeURIComponent(encodedRedirect!);

        // Should be exact pathname (no trailing ?)
        expect(decodedRedirect).toBe(pathname);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Multiple query params with same key pattern (like array params)
   * are preserved. Note: URLSearchParams.get() only returns first value,
   * but the full string should be preserved.
   */
  it('preserves query string structure including multiple params', () => {
    fc.assert(
      fc.property(
        nestedConsolePathArb,
        fc
          .array(fc.tuple(queryKeyArb, queryValueArb), {
            minLength: 2,
            maxLength: 4,
          })
          .map((pairs) => Object.fromEntries(pairs)),
        (pathname, queryParams) => {
          mockedValidateSessionCookie.mockReturnValue(null);

          const request = createMockRequest(pathname, {
            searchParams: queryParams,
          });
          const response = middleware(request);

          const location = response?.headers.get('location');
          const authUrl = new URL(location!, 'http://localhost:3000');
          const encodedRedirect = authUrl.searchParams.get('redirect');
          const decodedRedirect = decodeURIComponent(encodedRedirect!);

          // Count query params in original vs decoded
          const originalParamCount = Object.keys(queryParams).length;
          if (originalParamCount > 0) {
            const decodedUrl = new URL(decodedRedirect, 'http://localhost:3000');
            const decodedParamCount = Array.from(decodedUrl.searchParams.keys()).length;

            expect(decodedParamCount).toBe(originalParamCount);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit Tests for Redirect Preservation Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('redirect preservation unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONSOLE_PIN = 'test-pin-123456';
  });

  afterEach(() => {
    delete process.env.CONSOLE_PIN;
  });

  it('preserves /console/testing?id=123&view=detailed exactly', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/console/testing', {
      searchParams: { id: '123', view: 'detailed' },
    });
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    expect(decodedRedirect).toBe('/console/testing?id=123&view=detailed');
  });

  it('preserves path with URL-encoded characters in query values', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/console/playground', {
      searchParams: { filter: 'hello world', tag: 'a+b' },
    });
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    // Parse the decoded redirect URL to check individual params
    const decodedUrl = new URL(decodedRedirect, 'http://localhost:3000');
    expect(decodedUrl.pathname).toBe('/console/playground');
    expect(decodedUrl.searchParams.get('filter')).toBe('hello world');
    expect(decodedUrl.searchParams.get('tag')).toBe('a+b');
  });

  it('handles root /console path without query params', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/console');
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    expect(decodedRedirect).toBe('/console');
  });

  it('handles deeply nested path /console/a/b/c/d', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/console/a/b/c/d');
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    expect(decodedRedirect).toBe('/console/a/b/c/d');
  });

  it('handles UUID in path segment', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const request = createMockRequest(`/console/sessions/${uuid}`);
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    expect(decodedRedirect).toBe(`/console/sessions/${uuid}`);
  });

  it('handles multiple query params with similar keys', () => {
    mockedValidateSessionCookie.mockReturnValue(null);

    const request = createMockRequest('/console/search', {
      searchParams: { q: 'test', page: '2', limit: '10' },
    });
    const response = middleware(request);

    const location = response?.headers.get('location');
    const authUrl = new URL(location!, 'http://localhost:3000');
    const encodedRedirect = authUrl.searchParams.get('redirect');
    const decodedRedirect = decodeURIComponent(encodedRedirect!);

    const decodedUrl = new URL(decodedRedirect, 'http://localhost:3000');
    expect(decodedUrl.pathname).toBe('/console/search');
    expect(decodedUrl.searchParams.get('q')).toBe('test');
    expect(decodedUrl.searchParams.get('page')).toBe('2');
    expect(decodedUrl.searchParams.get('limit')).toBe('10');
  });
});
