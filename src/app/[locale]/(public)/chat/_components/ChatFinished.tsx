import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { StorageIcon } from '@/components/icons';
import { useScreening } from '../../_components/ScreeningProvider';

interface ChatFinishedProps {
  incognito: boolean;
  onSeeResult: () => void;
}

/**
 * Chat-completion footer.
 *
 * "Lihat Hasil" stays disabled until the image gate resolves, with a short
 * inline hint explaining why. The upload entry point is deliberately not here —
 * it is the "+" button in InputBar, which ChatScreen keeps mounted while the
 * gate is unresolved.
 *
 * Requirements: 2.3, 2.4
 */
export default function ChatFinished({ incognito, onSeeResult }: ChatFinishedProps) {
  const t = useTranslations('chat');
  const { imageGateResolved } = useScreening();

  return (
    <>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-text-muted">
        <StorageIcon />
        {incognito ? t('savedIncognito') : t('saved')}
      </div>
      {!imageGateResolved && (
        <p className="animate-pulse text-center text-xs text-text-muted">{t('waitingForImage')}</p>
      )}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onSeeResult}
        disabled={!imageGateResolved}
      >
        {t('seeResult')}
      </Button>
    </>
  );
}
