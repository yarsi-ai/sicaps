import { getTranslations } from 'next-intl/server';
import { ToastProvider } from '@/components/ui/Toast';
import SkipLink from '@/components/ui/SkipLink';
import { ScreeningProvider } from './_components/ScreeningProvider';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('a11y');

  return (
    <div
      className="sc-viewport relative flex items-stretch justify-center"
      style={{
        background: 'var(--color-surface-outer)',
      }}
    >
      <ToastProvider>
        <ScreeningProvider>
          <SkipLink label={t('skipToContent')} />
          <div className="relative flex h-full w-full max-w-[520px] flex-col bg-surface-alt shadow-[0_0_80px_color-mix(in_srgb,var(--color-text-strong)_16%,transparent)]">
            <main id="main-content" className="flex h-full w-full flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </ScreeningProvider>
      </ToastProvider>
    </div>
  );
}
