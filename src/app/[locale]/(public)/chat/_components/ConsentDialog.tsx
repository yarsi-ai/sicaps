'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { CameraIcon, InfoIcon, ShieldIcon, XIcon } from '@/components/icons';
import Button from '@/components/ui/Button';

interface ConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Modal dialog explaining image purpose, privacy, and revocation for visual
 * detection. Displayed once per session before the first image submission.
 *
 * Accessibility:
 * - Focus trap within dialog when open
 * - Escape key closes dialog (decline)
 * - Proper ARIA labels and roles
 * - Keyboard navigation between buttons
 */
export function ConsentDialog({ open, onAccept, onDecline }: ConsentDialogProps) {
  const t = useTranslations('chat');

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onDecline()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-brand-ink/40 data-[state=open]:animate-sc-pop" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[101] w-[calc(100%-32px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-card border-2 border-border-strong bg-surface-card p-5 shadow-sticker-lg focus:outline-none data-[state=open]:animate-sc-pop"
          aria-describedby="consent-description"
        >
          <Dialog.Title className="mb-4 flex items-center gap-2.5 font-display text-lg font-normal text-text-strong">
            <CameraIcon size={20} color="var(--color-brand-primary)" />
            {t('consentTitle')}
          </Dialog.Title>

          <div id="consent-description" className="mb-5 space-y-3.5 text-sm text-text-body">
            {/* Purpose */}
            <div className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">
                <InfoIcon />
              </span>
              <p>{t('consentPurpose')}</p>
            </div>

            {/* Privacy */}
            <div className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">
                <ShieldIcon size={16} color="var(--color-brand-primary)" />
              </span>
              <p>{t('consentPrivacy')}</p>
            </div>

            {/* Revocation */}
            <p className="rounded-input bg-surface-alt px-3 py-2.5 text-[13px] text-text-muted">
              {t('consentRevocation')}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outlined"
              size="md"
              fullWidth
              onClick={onDecline}
              aria-label={t('consentDecline')}
            >
              {t('consentDecline')}
            </Button>
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={onAccept}
              aria-label={t('consentAccept')}
            >
              {t('consentAccept')}
            </Button>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute top-3 right-3 rounded-icon p-1.5 text-text-muted transition-colors hover:bg-surface-alt hover:text-text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              aria-label="Close"
              onClick={onDecline}
            >
              <XIcon size={16} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ConsentDialog;
