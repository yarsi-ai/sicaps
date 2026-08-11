'use client';

import Chip from '@/components/ui/Chip';
import type { QuickReply } from '@/features/screening-chat-v2';

interface QuickReplyChipsProps {
  replies: QuickReply[];
  onSelect: (token: string, label: string) => void;
  disabled?: boolean;
}

export function QuickReplyChips({ replies, onSelect, disabled }: QuickReplyChipsProps) {
  if (replies.length === 0) return null;

  return (
    <div className="relative z-10 flex-none px-6.5 pb-1 pt-2">
      <div
        className="pointer-events-none absolute inset-x-0 -top-4 h-4"
        style={{ background: 'linear-gradient(180deg, transparent, var(--color-surface-alt))' }}
        aria-hidden="true"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick replies">
        {replies.map((reply) => (
          <Chip
            key={reply.token}
            type="button"
            onClick={() => onSelect(reply.token, reply.label)}
            disabled={disabled}
            aria-label={reply.label}
          >
            {reply.icon && <span className="mr-1">{reply.icon}</span>}
            {reply.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export default QuickReplyChips;
