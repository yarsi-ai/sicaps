'use client';

import { useTranslations } from 'next-intl';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import ChatBubble from './ChatBubble';
import ChatImageBubble from './ChatImageBubble';
import type { ChatMessage } from '@/types/screening-ui';

interface MessageListProps {
  messages: ChatMessage[];
  typing: boolean;
  finished?: boolean;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  incognito?: boolean;
  /**
   * Rendered while a photo is being submitted, before its turn exists in the
   * message list. Once the submission resolves the turn takes over.
   */
  pending?: React.ReactNode;
  /** Extra token appended to the auto-scroll key so `pending` changes scroll too. */
  pendingKey?: string;
  /** Called when a santri taps an image turn to view it larger. */
  onExpandImage?: (imageUrl: string) => void;
  /**
   * Called when the santri taps the retry button on a failed image turn that
   * was already committed to the transcript (i.e. `imageFailure` is set). The
   * message id is passed so ChatScreen can remove the stale row before
   * re-uploading.
   */
  onRetryImage?: (messageId: string) => void;
  /** How many upload attempts remain, forwarded to the retry button label. */
  imageRetryAttemptsLeft?: number;
}

export default function MessageList({
  messages,
  typing,
  finished,
  speakingId,
  onSpeak,
  incognito,
  pending,
  pendingKey = '',
  onExpandImage,
  onRetryImage,
  imageRetryAttemptsLeft,
}: MessageListProps) {
  const t = useTranslations('chat');
  const { scrollRef } = useAutoScroll(`${messages.length}-${typing}-${finished}-${pendingKey}`);

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      className="flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-6.5 pt-4.5 pb-2.5"
      style={{
        backgroundImage: 'radial-gradient(var(--color-dot-grid) 1px, transparent 1.1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div
        className={`self-center rounded-pill border-[1.5px] border-border-subtle bg-surface-card px-3 py-[3px] text-[11px] font-bold text-text-muted ${incognito ? 'mt-7' : ''}`}
      >
        {t('start')}
      </div>
      {messages.map((m) =>
        m.kind === 'image' ? (
          // The photo keeps its place in the transcript because it is a real
          // message row. `imageUrl` is absent on a restored session, which is
          // what makes the bubble fall back to its locked state.
          <ChatImageBubble
            key={m.id}
            src={m.imageUrl ?? null}
            status={m.imageFailure ? 'error' : 'done'}
            failureReason={m.imageFailure === 'analysis' ? 'analysis' : 'upload'}
            createdAt={m.createdAt}
            onExpand={
              m.imageUrl && onExpandImage ? () => onExpandImage(m.imageUrl as string) : undefined
            }
            onRetry={m.imageFailure && onRetryImage ? () => onRetryImage(m.id) : undefined}
            attemptsLeft={imageRetryAttemptsLeft}
          />
        ) : (
          <ChatBubble key={m.id} message={m} speaking={speakingId === m.id} onSpeak={onSpeak} />
        ),
      )}
      {pending}
      {typing && (
        <div
          className="flex w-fit gap-1.5 self-start rounded-bubble-bot border-2 border-border-strong bg-surface-bubble-bot px-3.5 py-2.5"
          style={{ boxShadow: '0 2px 0 var(--color-shadow-soft)' }}
        >
          <span className="animate-sc-typing h-[7px] w-[7px] rounded-full bg-border-dashed" />
          <span className="animate-sc-typing h-[7px] w-[7px] rounded-full bg-border-dashed [animation-delay:0.15s]" />
          <span className="animate-sc-typing h-[7px] w-[7px] rounded-full bg-border-dashed [animation-delay:0.3s]" />
        </div>
      )}
    </div>
  );
}
