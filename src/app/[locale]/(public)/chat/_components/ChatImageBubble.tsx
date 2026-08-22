'use client';

import { useTranslations } from 'next-intl';
import { AlertIcon, LockIcon, RetryIcon, SpinnerIcon } from '@/components/icons';
import { cx } from '@/lib/cx';
import type { ImageUploadStatus } from '@/types/screening-ui';

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

export interface ChatImageBubbleProps {
  /**
   * Local object URL for the selected image, or null once it is gone.
   *
   * Object URLs are per-document, so a refresh leaves the photo unreachable
   * while the bot messages describing it survive. A null `src` renders the
   * locked placeholder instead of an empty frame.
   */
  src: string | null;
  /** Upload + prediction status. Ignored when `src` is null. */
  status?: ImageUploadStatus;
  /** Alt text for the image */
  alt?: string;
  /**
   * What kind of failure to caption when the bubble is in its error state.
   * 'upload' (the default) means the photo never reached the server.
   * 'analysis' means it did, but the vision model could not read it — the photo
   * itself is fine, so this must not read as "please resend".
   */
  failureReason?: 'upload' | 'analysis';
  /** Called when the santri taps the photo to view it larger. */
  onExpand?: () => void;
  /**
   * Called when the santri taps the retry button after a failed upload.
   * When omitted (e.g. a historical failed bubble) no retry button is shown.
   */
  onRetry?: () => void;
  /**
   * How many retry attempts remain. Shown inside the retry button label.
   * Ignored when `onRetry` is not provided.
   */
  attemptsLeft?: number;
  /** ISO timestamp string for the time label shown below the bubble. */
  createdAt?: string;
  /**
   * Force error styling even when status is not 'error'.
   * Used when prediction failed but user still has retry attempts.
   */
  showError?: boolean;
}

/**
 * The submitted photo, rendered as a user-side chat bubble.
 *
 * Mirrors ChatBubble's geometry (`rounded-bubble-user`, 2px strong border, the
 * sticker drop shadow) so it reads as part of the conversation rather than an
 * overlay. Mounted from the IMAGE message row, so it keeps its position in the
 * transcript.
 *
 * Requirements: 5.1, 5.2, 5.3
 */
export function ChatImageBubble({
  src,
  status = 'idle',
  alt,
  onExpand,
  onRetry,
  attemptsLeft,
  createdAt,
  showError = false,
  failureReason = 'upload',
}: ChatImageBubbleProps) {
  const t = useTranslations('imageUpload');

  if (src === null) {
    return (
      <div className="flex max-w-[86%] flex-col items-end gap-1 self-end">
        <div
          className="flex items-center gap-2 rounded-bubble-user border-2 border-border-strong bg-surface-card px-3.5 py-2.5"
          style={{ boxShadow: '0 2px 0 var(--color-shadow-soft)' }}
        >
          <LockIcon />
          <span className="text-[12.5px] text-text-body">{t('storedSecurely')}</span>
        </div>
        <span className="px-1 text-[10px] font-semibold text-text-faint">
          {t('storedSecurelyHint')}
        </span>
      </div>
    );
  }

  // Show error styling for explicit error status OR when showError is true
  const isErrorState = status === 'error' || showError;
  const expandable = onExpand !== undefined && status !== 'uploading';
  const showRetryButton = isErrorState && onRetry !== undefined;

  return (
    <div className="flex max-w-[86%] flex-col items-end gap-1 self-end">
      <div
        className={cx(
          'relative aspect-[4/3] w-[200px] overflow-hidden rounded-bubble-user border-2',
          isErrorState ? 'border-accent-danger' : 'border-border-strong',
        )}
        style={{ boxShadow: '0 2px 0 var(--color-shadow-soft)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? t('imageAlt')}
          className={cx(
            'block h-full w-full object-cover',
            status === 'uploading' && 'opacity-60',
            isErrorState && 'opacity-40',
          )}
        />

        {expandable && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={t('expand')}
            className="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset"
          />
        )}

        {status === 'uploading' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-brand-ink/30"
            aria-live="polite"
            aria-label={t('uploading')}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border-strong bg-surface-card">
              <SpinnerIcon />
            </span>
          </div>
        )}

        {isErrorState && status !== 'uploading' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-brand-ink/40"
            role="alert"
          >
            {showRetryButton ? (
              <button
                type="button"
                onClick={onRetry}
                aria-label={t('retryUpload', { attemptsLeft: attemptsLeft ?? 0 })}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-border-strong bg-accent-danger active:opacity-70"
              >
                <RetryIcon size={20} color="#FFF9EC" />
              </button>
            ) : (
              <span className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-full border-2 border-border-strong bg-accent-danger">
                <AlertIcon />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom row: timestamp + status label, matching ChatBubble layout */}
      <div className="flex w-full items-center justify-end gap-1.5 px-1">
        {status === 'uploading' && (
          <span className="text-[10px] font-semibold text-text-faint">{t('uploading')}</span>
        )}
        {createdAt && (
          <span className="text-[10px] font-semibold text-text-faint">{formatTime(createdAt)}</span>
        )}
        {isErrorState && status !== 'uploading' && (
          <span className="text-[10px] font-semibold text-accent-danger">
            {t(failureReason === 'analysis' ? 'analysisFailed' : 'uploadFailed')}
          </span>
        )}
      </div>
    </div>
  );
}

export default ChatImageBubble;
