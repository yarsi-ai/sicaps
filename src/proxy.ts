import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from '@/i18n/config';
import { validateSessionCookie } from './lib/console-auth';
import { CONFIG } from './lib/config';
import { getEnv } from './lib/env';

/**
 * Next.js Middleware combining i18n routing and Console PIN Protection.
 *
 * - Console routes (/console/*) are protected by PIN-based authentication
 * - Non-console routes are handled by next-intl for locale routing
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 2.2, 6.1, 6.2, 7.1, 7.2
 */

// ============================================================================
// i18n Configuration
// ============================================================================

const routing = defineRouting({
  locales,
  defaultLocale,
  localeDetection: false,
});

const intlMiddleware = createIntlMiddleware(routing);

// ============================================================================
// Console PIN Protection
// ============================================================================

/**
 * Check if a path is a console route that should be protected.
 */
function isConsoleRoute(pathname: string): boolean {
  return pathname.startsWith('/console') || pathname.startsWith('/api/console');
}

/**
 * Check if a console path should be protected by the Console Guard.
 * Returns false for auth-related paths that must remain accessible.
 *
 * Bypassed paths:
 * - /console/auth (PIN entry page)
 * - /console/auth/* (any sub-paths under auth)
 * - /api/console/auth/* (auth API endpoints, e.g., verify)
 */
function isProtectedConsolePath(pathname: string): boolean {
  // PIN entry page must be accessible to enter PIN
  if (pathname === '/console/auth') {
    return false;
  }

  // Allow any sub-paths of /console/auth (e.g., /console/auth/something)
  if (pathname.startsWith('/console/auth/')) {
    return false;
  }

  // Allow all auth API endpoints (e.g., /api/console/auth/verify)
  if (pathname.startsWith('/api/console/auth/')) {
    return false;
  }

  return true;
}

/**
 * Check if the request is an API request (non-navigation).
 * API requests receive 401 JSON response instead of redirect.
 */
function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * Create a 401 JSON response for unauthorized API requests.
 */
function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    },
    { status: 401 },
  );
}

/**
 * Create a redirect response to the PIN entry page.
 * Preserves the original requested path in the redirect query param.
 *
 * Requirements 6.1, 6.2: Record original path including query parameters.
 */
function createAuthRedirect(request: NextRequest): NextResponse {
  const originalPath = request.nextUrl.pathname + request.nextUrl.search;
  const authUrl = new URL('/console/auth', request.url);
  // Use encodeURIComponent to ensure the redirect param can be safely passed as URL param
  // The auth page will decode it with decodeURIComponent before using it
  authUrl.searchParams.set('redirect', encodeURIComponent(originalPath));

  return NextResponse.redirect(authUrl);
}

/**
 * Validate the session cookie from the request.
 * Returns true if the session is valid and not expired.
 */
function hasValidSession(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get(CONFIG.console.SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return false;
  }

  // Read CONSOLE_PIN exclusively through the validated env config (Requirement 5.4).
  // Next.js 16 Proxy runs on the Node.js runtime, so the full Zod-validated
  // env module is safe to use here (no Edge runtime restriction).
  let consolePin: string;
  try {
    consolePin = getEnv().CONSOLE_PIN;
  } catch {
    // Env validation failed — deny all access (fail-secure)
    return false;
  }

  const session = validateSessionCookie(sessionCookie.value, consolePin);
  return session !== null;
}

/**
 * Handle console route protection.
 * Returns a response if access should be denied, undefined to allow.
 */
function handleConsoleProtection(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // Skip protection for auth-related paths
  if (!isProtectedConsolePath(pathname)) {
    return undefined;
  }

  // Check for valid session
  if (hasValidSession(request)) {
    return undefined;
  }

  // No valid session - handle based on request type
  if (isApiRequest(pathname)) {
    return createUnauthorizedResponse();
  }

  // Page request - redirect to auth
  return createAuthRedirect(request);
}

// ============================================================================
// Main Middleware
// ============================================================================

export default function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // Handle console routes - PIN protection
  if (isConsoleRoute(pathname)) {
    return handleConsoleProtection(request);
  }

  // Handle non-console routes - i18n middleware
  return intlMiddleware(request);
}

/**
 * Matcher configuration for Next.js middleware.
 *
 * Matches:
 * - /console/* paths (for PIN protection)
 * - /api/console/* paths (for PIN protection)
 * - All other paths except static files, _next, _vercel (for i18n)
 *
 * Requirements 7.1, 7.2: Non-console routes use i18n middleware normally.
 */
export const config = {
  matcher: [
    // Console routes for PIN protection
    '/console/:path*',
    '/api/console/:path*',
    // Non-console routes for i18n (excludes api, _next, _vercel, console, static files)
    '/((?!api|_next|_vercel|console|.*\\..*).*)',
  ],
};
