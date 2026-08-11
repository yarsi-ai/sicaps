'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MicIcon, PlusIcon, SendIcon, VoiceBarsIcon } from '@/components/icons';
import { cx } from '@/lib/cx';

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  recording: boolean;
  voiceMode: boolean;
  onMicTap: () => void;
  onToggleVoiceMode: () => void;
  onAttach: () => void;
  disabled?: boolean;
  chipsActive?: boolean;
  chipsPreview?: string;
}

/** line-height for text-sm leading-5 */
const LINE_HEIGHT = 20;
const MAX_LINES = 5;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

export default function InputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  recording,
  voiceMode,
  onMicTap,
  onToggleVoiceMode,
  onAttach,
  disabled = false,
  chipsActive = false,
  chipsPreview,
}: InputBarProps) {
  const t = useTranslations('chat');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasInput = value.trim().length > 0;
  const hasChipsSelection = chipsActive && !!chipsPreview;
  const inputBlocked = disabled || chipsActive;
  const showSend = hasInput || hasChipsSelection;
  const sendEnabled = !disabled && showSend;

  const handleSubmit = useCallback(() => {
    if (!sendEnabled) return;
    onSubmit();
  }, [sendEnabled, onSubmit]);

  // Auto-resize textarea to content, max 5 lines
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight includes padding; cap at max 5 lines + padding
    const maxH = MAX_HEIGHT + 20; // 5 lines (100px) + 20px padding
    const newHeight = Math.min(el.scrollHeight, maxH);
    el.style.height = `${newHeight}px`;
  }, []);

  // Resize on value or chips preview changes
  useEffect(() => {
    autoResize();
  }, [value, chipsPreview, autoResize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (sendEnabled) handleSubmit();
    }
  };

  return (
    <div className={cx(disabled && 'opacity-50')}>
      <div
        className={cx(
          'flex gap-1.5 rounded-[22px] border-2 border-border-strong bg-surface-card px-1.5 py-1.5',
          'items-end',
          disabled && 'cursor-not-allowed',
        )}
        style={{ boxShadow: '0 3px 0 var(--color-shadow-mascot)' }}
      >
        <button
          onClick={onAttach}
          disabled={inputBlocked}
          title={t('attachTitle')}
          aria-label={t('attachTitle')}
          className={cx(
            'flex h-9 w-9 flex-none items-center justify-center rounded-full border-none bg-transparent text-text-faint',
            inputBlocked ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <PlusIcon />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputBlocked}
          rows={1}
          placeholder={placeholder}
          aria-disabled={inputBlocked}
          className={cx(
            'scrollbar-textarea min-w-0 flex-1 resize-none border-none bg-transparent px-1 py-[10px] text-sm leading-5 outline-none placeholder:text-text-subtle text-text-strong',
            inputBlocked && 'cursor-not-allowed',
          )}
          style={{
            minHeight: '40px',
            maxHeight: `${MAX_HEIGHT + 20}px`,
            overflowY: 'auto',
          }}
        />

        <button
          onClick={onMicTap}
          disabled={inputBlocked}
          title={t('micTitle')}
          aria-label={t('micTitle')}
          className={cx(
            'flex h-10 w-10 flex-none items-center justify-center rounded-full border-none',
            recording ? 'animate-sc-blink bg-accent-danger' : 'bg-transparent',
            inputBlocked ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <MicIcon color={recording ? '#FFF9EC' : 'var(--color-brand-primary)'} />
        </button>

        {showSend ? (
          <button
            onClick={handleSubmit}
            disabled={!sendEnabled}
            title={t('sendTitle')}
            aria-label={t('sendTitle')}
            className={cx(
              'flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 border-border-strong bg-brand-primary shadow-sticker-sm',
              !sendEnabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
          >
            <SendIcon />
          </button>
        ) : (
          <button
            onClick={onToggleVoiceMode}
            disabled={inputBlocked}
            title={t('voiceTitle')}
            aria-label={t('voiceTitle')}
            className={cx(
              'flex h-10 w-10 flex-none items-center justify-center rounded-full border-none',
              voiceMode ? 'animate-sc-send-glow bg-brand-primary' : 'bg-surface-app',
              inputBlocked ? 'cursor-not-allowed' : 'cursor-pointer',
            )}
          >
            <VoiceBarsIcon color={voiceMode ? '#FFF9EC' : 'var(--color-brand-primary)'} />
          </button>
        )}
      </div>
    </div>
  );
}
