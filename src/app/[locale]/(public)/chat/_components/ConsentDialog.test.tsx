import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentDialog } from './ConsentDialog';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      consentTitle: 'Photo Permission',
      consentPurpose: 'Your photo will be analyzed by AI.',
      consentPrivacy: 'Your photo is stored securely.',
      consentRevocation: 'You can decline without affecting results.',
      consentAccept: 'Setuju',
      consentDecline: 'Tolak',
    };
    return translations[key] ?? key;
  },
}));

describe('ConsentDialog', () => {
  const defaultProps = {
    open: true,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders consent title and text when open', () => {
    render(<ConsentDialog {...defaultProps} />);

    expect(screen.getByText('Photo Permission')).toBeInTheDocument();
    expect(screen.getByText('Your photo will be analyzed by AI.')).toBeInTheDocument();
    expect(screen.getByText('Your photo is stored securely.')).toBeInTheDocument();
    expect(screen.getByText('You can decline without affecting results.')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<ConsentDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Photo Permission')).not.toBeInTheDocument();
  });

  it('calls onAccept when accept button clicked', () => {
    const onAccept = vi.fn();
    render(<ConsentDialog {...defaultProps} onAccept={onAccept} />);

    fireEvent.click(screen.getByRole('button', { name: 'Setuju' }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when decline button clicked', () => {
    const onDecline = vi.fn();
    render(<ConsentDialog {...defaultProps} onDecline={onDecline} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when close (X) button clicked', () => {
    const onDecline = vi.fn();
    render(<ConsentDialog {...defaultProps} onDecline={onDecline} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // The X button triggers onDecline via onClick AND onOpenChange, so called at least once
    expect(onDecline).toHaveBeenCalled();
  });

  it('calls onDecline when dialog is closed via onOpenChange', () => {
    const onDecline = vi.fn();
    render(<ConsentDialog {...defaultProps} onDecline={onDecline} />);

    // Simulate Radix dialog close by pressing Escape
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(onDecline).toHaveBeenCalled();
  });

  it('has proper aria-describedby for accessibility', () => {
    render(<ConsentDialog {...defaultProps} />);

    const dialogContent = screen.getByRole('dialog');
    expect(dialogContent).toHaveAttribute('aria-describedby', 'consent-description');

    const description = document.getElementById('consent-description');
    expect(description).toBeInTheDocument();
  });

  it('renders both accept and decline buttons', () => {
    render(<ConsentDialog {...defaultProps} />);

    const acceptBtn = screen.getByRole('button', { name: 'Setuju' });
    const declineBtn = screen.getByRole('button', { name: 'Tolak' });

    expect(acceptBtn).toBeInTheDocument();
    expect(declineBtn).toBeInTheDocument();
  });
});
