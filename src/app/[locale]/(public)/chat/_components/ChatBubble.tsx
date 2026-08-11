'use client';

import { useLongPress } from '@/hooks/useLongPress';
import { cx } from '@/lib/cx';
import type { ChatMessage } from '@/types/screening-ui';

interface ChatBubbleProps {
  message: ChatMessage;
  speaking: boolean;
  onSpeak: (id: string, text: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

export default function ChatBubble({ message, speaking, onSpeak }: ChatBubbleProps) {
  const bot = message.role === 'bot';
  const longPress = useLongPress({
    delay: 300,
    onLongPress: () => onSpeak(message.id, message.text),
  });

  return (
    <div
      className={cx(
        'flex max-w-[86%] flex-col gap-1',
        bot ? 'items-start self-start' : 'items-end self-end',
      )}
    >
      <div
        {...longPress}
        className={cx(
          'cursor-pointer border-2 border-border-strong px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words transition-transform select-none',
          bot
            ? 'rounded-bubble-bot bg-surface-bubble-bot text-text-strong'
            : 'rounded-bubble-user bg-brand-primary text-text-cream',
          speaking && 'animate-sc-tts-pulse scale-[1.03]',
        )}
        style={{ boxShadow: '0 2px 0 var(--color-shadow-soft)' }}
      >
        {message.text}
      </div>
      <span className="px-1 text-[10px] font-semibold text-text-faint">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}
