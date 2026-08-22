import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatImageBubble } from './ChatImageBubble';
import type { ImageUploadStatus } from '@/types/screening-ui';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      imageAlt: 'Uploaded skin photo',
      uploading: 'Uploading photo',
      uploadFailed: 'Could not send — try again with the + button',
      analysisFailed: 'Analysis failed',
      expand: 'View photo larger',
      storedSecurely: 'Photo stored securely',
      storedSecurelyHint: 'Only used for this screening',
    };
    return translations[key] ?? key;
  },
}));

const SRC = 'blob:preview';

describe('ChatImageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with a reachable photo', () => {
    it('renders the image with alt text', () => {
      render(<ChatImageBubble src={SRC} status="done" />);

      const img = screen.getByAltText('Uploaded skin photo');
      expect(img).toHaveAttribute('src', SRC);
    });

    it('renders on the user side, matching text bubbles', () => {
      const { container } = render(<ChatImageBubble src={SRC} status="done" />);

      expect(container.querySelector('.self-end')).toBeInTheDocument();
    });

    /**
     * Every bubble is the same 4:3 box regardless of the source dimensions. A
     * portrait screenshot used to render as a tall narrow column that crowded
     * out the rest of the conversation.
     */
    it('frames the photo at a fixed 4:3 ratio', () => {
      const { container } = render(<ChatImageBubble src={SRC} status="done" />);

      const frame = container.querySelector('.aspect-\\[4\\/3\\]');
      expect(frame).toBeInTheDocument();
      expect(frame).toHaveClass('w-[200px]');
    });

    it('fills the frame and crops the overflow', () => {
      render(<ChatImageBubble src={SRC} status="done" />);

      // Cropping is acceptable because the lightbox shows the whole photo.
      expect(screen.getByAltText('Uploaded skin photo')).toHaveClass(
        'h-full',
        'w-full',
        'object-cover',
      );
    });

    it('shows no caption once the submission resolved', () => {
      render(<ChatImageBubble src={SRC} status="done" />);

      // The bot message carries the outcome, so a caption would just repeat it.
      expect(screen.queryByText('Uploading photo')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Could not send — try again with the + button'),
      ).not.toBeInTheDocument();
    });
  });

  describe('while uploading', () => {
    it('shows the uploading caption', () => {
      render(<ChatImageBubble src={SRC} status="uploading" />);

      expect(screen.getByText('Uploading photo')).toBeInTheDocument();
    });

    it('does not offer expansion mid-flight', () => {
      const onExpand = vi.fn();
      render(<ChatImageBubble src={SRC} status="uploading" onExpand={onExpand} />);

      expect(screen.queryByRole('button', { name: 'View photo larger' })).not.toBeInTheDocument();
    });
  });

  describe('when the photo never reached the server', () => {
    it('says it could not be sent and points at the + button', () => {
      render(<ChatImageBubble src={SRC} status="error" />);

      expect(screen.getByText('Could not send — try again with the + button')).toBeInTheDocument();
    });

    it('marks the bubble with the danger token', () => {
      const { container } = render(<ChatImageBubble src={SRC} status="error" />);

      expect(container.querySelector('.border-accent-danger')).toBeInTheDocument();
    });

    /**
     * The design names a single entry point for sending a photo: the "+" button
     * in InputBar, which ChatScreen keeps live after a failure. A retry control
     * here would be a second one.
     */
    it('offers no retry control of its own', () => {
      render(<ChatImageBubble src={SRC} status="error" />);

      expect(screen.queryByRole('button', { name: /retry|coba lagi/i })).not.toBeInTheDocument();
    });
  });

  /**
   * A photo that reached the server but could not be read by the vision model
   * is a different failure from one that never arrived — the photo itself is
   * fine, so it must not tell the santri to resend it.
   */
  describe('when the photo reached the server but could not be analysed', () => {
    it('says analysis failed, not that the send failed', () => {
      render(<ChatImageBubble src={SRC} status="done" showError failureReason="analysis" />);

      expect(screen.getByText('Analysis failed')).toBeInTheDocument();
      expect(
        screen.queryByText('Could not send — try again with the + button'),
      ).not.toBeInTheDocument();
    });

    it('defaults to the upload caption when failureReason is omitted', () => {
      render(<ChatImageBubble src={SRC} status="error" />);

      expect(screen.getByText('Could not send — try again with the + button')).toBeInTheDocument();
      expect(screen.queryByText('Analysis failed')).not.toBeInTheDocument();
    });
  });

  describe('expansion', () => {
    it('exposes a named control rather than a bare clickable image', () => {
      render(<ChatImageBubble src={SRC} status="done" onExpand={vi.fn()} />);

      // A focusable, named button is what makes this reachable by keyboard.
      expect(screen.getByRole('button', { name: 'View photo larger' })).toBeInTheDocument();
    });

    it('calls onExpand when tapped', () => {
      const onExpand = vi.fn();
      render(<ChatImageBubble src={SRC} status="done" onExpand={onExpand} />);

      fireEvent.click(screen.getByRole('button', { name: 'View photo larger' }));

      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('omits the control when no handler is given', () => {
      render(<ChatImageBubble src={SRC} status="done" />);

      expect(screen.queryByRole('button', { name: 'View photo larger' })).not.toBeInTheDocument();
    });
  });

  /**
   * Object URLs are per-document, so a refresh leaves the photo unreachable
   * while the bot messages describing it survive. Rather than an empty frame,
   * the turn reassures the santri that the photo is still held safely.
   */
  describe('when the photo is gone', () => {
    it('renders the locked placeholder instead of an image', () => {
      render(<ChatImageBubble src={null} />);

      expect(screen.getByText('Photo stored securely')).toBeInTheDocument();
      expect(screen.queryByAltText('Uploaded skin photo')).not.toBeInTheDocument();
    });

    it('explains the photo is only used for this screening', () => {
      render(<ChatImageBubble src={null} />);

      expect(screen.getByText('Only used for this screening')).toBeInTheDocument();
    });

    it('offers no expansion, since there is nothing to show', () => {
      render(<ChatImageBubble src={null} onExpand={vi.fn()} />);

      expect(screen.queryByRole('button', { name: 'View photo larger' })).not.toBeInTheDocument();
    });

    it('stays on the user side like the photo it replaces', () => {
      const { container } = render(<ChatImageBubble src={null} />);

      expect(container.querySelector('.self-end')).toBeInTheDocument();
    });
  });

  it('accepts every upload status without throwing', () => {
    const statuses: ImageUploadStatus[] = ['idle', 'uploading', 'done', 'error'];

    for (const status of statuses) {
      const { unmount } = render(<ChatImageBubble src={SRC} status={status} />);
      expect(screen.getByAltText('Uploaded skin photo')).toBeInTheDocument();
      unmount();
    }
  });
});
