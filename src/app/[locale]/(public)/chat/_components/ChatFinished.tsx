import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { StorageIcon } from '@/components/icons';

interface ChatFinishedProps {
  incognito: boolean;
  onSeeResult: () => void;
}

export default function ChatFinished({ incognito, onSeeResult }: ChatFinishedProps) {
  const t = useTranslations('chat');
  return (
    <>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-text-muted">
        <StorageIcon />
        {incognito ? t('savedIncognito') : t('saved')}
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onSeeResult}>
        {t('seeResult')}
      </Button>
    </>
  );
}
