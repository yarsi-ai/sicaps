import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickReplyChips } from './QuickReplyChips';
import type { QuickReply } from '@/features/screening-chat-v2';

const sampleReplies: QuickReply[] = [
  { token: 'lihat_hasil', label: 'Lihat Hasil', icon: '📊' },
  { token: 'tanya_dulu', label: 'Tanya Dulu' },
];

describe('QuickReplyChips', () => {
  it('renders nothing when replies is empty', () => {
    const { container } = render(<QuickReplyChips replies={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders buttons for each reply', () => {
    render(<QuickReplyChips replies={sampleReplies} onSelect={vi.fn()} />);
    expect(screen.getByText('Lihat Hasil')).toBeDefined();
    expect(screen.getByText('Tanya Dulu')).toBeDefined();
  });

  it('sends token and label on click', () => {
    const onSelect = vi.fn();
    render(<QuickReplyChips replies={sampleReplies} onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText('Lihat Hasil'));
    expect(onSelect).toHaveBeenCalledWith('lihat_hasil', 'Lihat Hasil');
  });

  it('renders icon when provided', () => {
    render(<QuickReplyChips replies={sampleReplies} onSelect={vi.fn()} />);
    expect(screen.getByText('📊')).toBeDefined();
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<QuickReplyChips replies={sampleReplies} onSelect={vi.fn()} disabled />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveProperty('disabled', true);
    }
  });

  it('has accessible group role and aria-label', () => {
    render(<QuickReplyChips replies={sampleReplies} onSelect={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Quick replies' })).toBeDefined();
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = vi.fn();
    render(<QuickReplyChips replies={sampleReplies} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByLabelText('Lihat Hasil'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
