'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * PIN entry form for Console access.
 *
 * Reads the `redirect` query param (set by the Console_Guard) and submits
 * the PIN to the verify endpoint. On success, navigates to the redirect
 * path returned by the server.
 *
 * **Validates: Requirements 1.1, 3.2, 4.2, 6.1, 6.3, 6.4**
 */
export function PinEntryForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Decode the redirect param since middleware encodes it with encodeURIComponent
  const redirectParam = searchParams.get('redirect');
  const redirect = redirectParam ? decodeURIComponent(redirectParam) : null;

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/console/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, redirect: redirect ?? undefined }),
      });

      const body = await response.json();

      if (response.ok && body.data) {
        router.push(body.data.redirect as string);
      } else if (response.status === 429) {
        // Rate limited
        setError('Too many attempts. Please wait.');
      } else {
        // Invalid PIN or validation error - show generic message
        setError('Invalid PIN');
      }
    } catch {
      setError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-app px-4 font-sans">
      <div className="w-full max-w-xs">
        {/* Card container */}
        <div
          className="rounded-card border-2 border-border-subtle bg-surface-card p-6"
          style={{ boxShadow: '0 4px 0 var(--color-shadow-mascot)' }}
        >
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-chip">
              <svg
                className="h-6 w-6 text-brand-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="font-display text-xl text-text-strong">Console Access</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              {/* PIN Input - no label needed */}
              <input
                id="pin"
                type="password"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={isLoading}
                aria-label="PIN"
                aria-describedby={error ? 'pin-error' : undefined}
                aria-invalid={error ? 'true' : 'false'}
                className="sc-input disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter PIN"
              />
              {error && (
                <p id="pin-error" className="mt-1.5 text-sm text-risk-high" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !pin}
              className="w-full cursor-pointer rounded-card border-2 border-border-strong bg-brand-primary px-4 py-3.5 font-display text-[14.5px] font-normal text-text-cream shadow-sticker-lg transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {isLoading ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
