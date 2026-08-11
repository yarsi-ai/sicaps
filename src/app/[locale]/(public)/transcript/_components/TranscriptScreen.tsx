'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import AppFooter from '@/components/ui/AppFooter';
import Button from '@/components/ui/Button';
import HeaderBar from '@/components/ui/HeaderBar';
import ChatBubble from '../../chat/_components/ChatBubble';
import type { ChatMessage } from '@/types/screening-ui';

/** Production API envelope */
interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { timestamp: string; requestId: string };
}

/** Production transcript message shape */
interface TranscriptApiMessage {
  role: 'bot' | 'user';
  content: string;
  createdAt: string;
  isVoice: boolean;
}

export default function TranscriptScreen() {
  const t = useTranslations('transkrip');
  const common = useTranslations('common');
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('session');
  const token = searchParams.get('token');

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const notFound = !sessionId || !token || fetchFailed;

  useEffect(() => {
    if (!sessionId || !token) return;
    fetch(`/api/screening/${sessionId}/transcript?token=${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((envelope: ApiEnvelope<{ messages: TranscriptApiMessage[] }>) => {
        if (!envelope.data) throw new Error('no data');
        // Map transcript messages to ChatMessage format
        const mapped: ChatMessage[] = envelope.data.messages.map((m, idx) => ({
          id: `transcript-${idx}`,
          role: m.role,
          text: m.content,
          createdAt: m.createdAt,
        }));
        setMessages(mapped);
      })
      .catch(() => setFetchFailed(true));
  }, [sessionId, token]);

  return (
    <div className="flex h-full flex-col bg-surface-alt">
      <HeaderBar
        title={t('title')}
        onBack={() => router.push('/history')}
        backLabel={common('back')}
      />

      {notFound && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-text-body">{t('notFound')}</p>
        </div>
      )}

      {!notFound && messages && (
        <>
          <div className="px-6.5 pb-2 text-center text-[11.5px] font-semibold text-text-muted">
            {t('readOnlyNote')}
          </div>
          <div className="relative flex flex-1 flex-col gap-2.5 overflow-y-auto px-6.5 pb-3.5">
            <div
              className="pointer-events-none sticky top-0 z-10 -mx-6.5 h-4 flex-none"
              style={{
                background: 'linear-gradient(180deg, var(--color-surface-alt), transparent)',
              }}
              aria-hidden="true"
            />
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} speaking={false} onSpeak={() => {}} />
            ))}
          </div>
          <AppFooter gradient>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => router.push(`/result?session=${sessionId}&token=${token}`)}
            >
              {t('backToResult')}
            </Button>
          </AppFooter>
        </>
      )}
    </div>
  );
}
