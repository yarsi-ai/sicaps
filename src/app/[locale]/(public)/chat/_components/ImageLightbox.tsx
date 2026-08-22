'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { XIcon } from '@/components/icons';

export interface ImageLightboxProps {
  /** Object URL of the photo to show, or null when closed. */
  src: string | null;
  onClose: () => void;
}

/**
 * Full-size view of the submitted photo.
 *
 * Only ever shows a local object URL. The stored copy lives in a private bucket
 * and is deliberately not served here: the v2 share token is currently equal to
 * the session id (see docs/issues/issue-security-share-token-v2.md), so an
 * endpoint keyed on the session would hand skin photos to anyone who learned a
 * UUID. Serving stored images waits on that being fixed.
 *
 * Radix Dialog gives the focus trap, Escape handling, and scroll lock, matching
 * ConsentDialog and ImageActionSheet.
 *
 * Requirements: 5.4
 */
export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const t = useTranslations('imageUpload');

  return (
    <Dialog.Root open={src !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-brand-ink/80 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[111] mx-auto flex max-w-shell items-center justify-center p-4 focus:outline-none"
        >
          <Dialog.Title className="sr-only">{t('expand')}</Dialog.Title>

          {src !== null && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={t('imageAlt')}
              className="max-h-full max-w-full rounded-card border-2 border-border-strong object-contain"
            />
          )}

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t('closeExpanded')}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-border-strong bg-surface-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              <XIcon size={16} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ImageLightbox;
