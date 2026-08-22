'use client';

import { useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { CameraIcon, GalleryIcon, XIcon } from '@/components/icons';
import { cx } from '@/lib/cx';
import { isAllowedMimeType, isWithinSizeLimit } from '@/lib/vision';
import { CONFIG } from '@/lib/config';

export interface ImageActionSheetProps {
  open: boolean;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onValidationError?: (error: 'invalid_type' | 'file_too_large') => void;
}

const ACCEPT_TYPES = CONFIG.visualDetection.ALLOWED_MIME_TYPES.join(',');

/**
 * Bottom sheet action menu for image selection.
 * Provides two options:
 * - "Ambil Foto" (Take Photo): triggers camera capture with `capture="environment"`
 * - "Pilih dari Galeri" (Choose from Gallery): triggers standard file picker
 *
 * Validates file MIME type and size client-side before emitting.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export function ImageActionSheet({
  open,
  onClose,
  onFileSelect,
  onValidationError,
}: ImageActionSheetProps) {
  const t = useTranslations('imageUpload');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input value so the same file can be selected again if needed
      e.target.value = '';

      if (!file) return;

      // Validate MIME type
      if (!isAllowedMimeType(file.type)) {
        onValidationError?.('invalid_type');
        return;
      }

      // Validate file size
      if (!isWithinSizeLimit(file.size)) {
        onValidationError?.('file_too_large');
        return;
      }

      // Valid file - close sheet and emit
      onClose();
      onFileSelect(file);
    },
    [onClose, onFileSelect, onValidationError],
  );

  const handleCameraClick = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleGalleryClick = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cx(
            'fixed inset-0 z-[100] bg-brand-ink/40',
            'data-[state=open]:animate-[fadeIn_200ms_ease-out]',
            'data-[state=closed]:animate-[fadeOut_150ms_ease-in]',
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cx(
            // Portalled to body, so it must re-derive the shell's geometry:
            // centered and capped at the same width, rather than stretching to
            // the viewport. Below 520px this still fills the screen.
            //
            // Centered with `mx-auto`, not `-translate-x-1/2`: the slideUp /
            // slideDown keyframes animate `transform`, which would replace a
            // translate-based centering mid-flight and throw the sheet sideways.
            'fixed inset-x-0 bottom-0 z-[101] mx-auto w-full max-w-shell',
            'rounded-t-[24px] bg-surface-card',
            'border-t-2 border-border-subtle',
            'pb-safe px-4 pt-3',
            'data-[state=open]:animate-[slideUp_250ms_ease-out]',
            'data-[state=closed]:animate-[slideDown_200ms_ease-in]',
          )}
        >
          {/* Drag handle indicator */}
          <div className="mb-3 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-border-subtle" />
          </div>

          <Dialog.Title className="mb-4 text-center font-display text-lg text-text-strong">
            {t('sheetTitle')}
          </Dialog.Title>

          <div className="flex flex-col gap-2">
            {/* Camera option */}
            <button
              type="button"
              onClick={handleCameraClick}
              className={cx(
                'flex w-full items-center gap-3 rounded-card px-4 py-3.5',
                'bg-surface-alt text-text-strong',
                'border-2 border-transparent',
                'transition-colors active:bg-surface-chip',
                'cursor-pointer',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary text-text-cream">
                <CameraIcon />
              </span>
              <span className="text-[15px] font-medium">{t('takePhoto')}</span>
            </button>

            {/* Gallery option */}
            <button
              type="button"
              onClick={handleGalleryClick}
              className={cx(
                'flex w-full items-center gap-3 rounded-card px-4 py-3.5',
                'bg-surface-alt text-text-strong',
                'border-2 border-transparent',
                'transition-colors active:bg-surface-chip',
                'cursor-pointer',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-secondary text-text-cream">
                <GalleryIcon />
              </span>
              <span className="text-[15px] font-medium">{t('chooseFromGallery')}</span>
            </button>

            {/* Cancel button */}
            <button
              type="button"
              onClick={onClose}
              className={cx(
                'mt-1 w-full rounded-card px-4 py-3.5',
                'bg-transparent text-text-muted',
                'border-2 border-border-subtle',
                'transition-colors active:bg-surface-alt',
                'cursor-pointer font-medium',
              )}
            >
              {t('cancel')}
            </button>
          </div>

          {/* Close button (X) for accessibility - top right */}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t('cancel')}
              className={cx(
                'absolute right-3 top-3',
                'flex h-8 w-8 items-center justify-center rounded-full',
                'text-text-muted hover:bg-surface-alt',
                'cursor-pointer',
              )}
            >
              <XIcon size={18} />
            </button>
          </Dialog.Close>

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            capture="environment"
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ImageActionSheet;
