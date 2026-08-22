import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatFinished from './ChatFinished';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      saved: 'Saved',
      savedIncognito: 'Saved (incognito)',
      seeResult: 'Lihat Hasil',
      waitingForImage: 'Menunggu foto...',
    };
    return translations[key] ?? key;
  },
}));

// Mock ScreeningProvider
const mockUseScreening = vi.fn();
vi.mock('../../_components/ScreeningProvider', () => ({
  useScreening: () => mockUseScreening(),
}));

describe('ChatFinished', () => {
  const defaultProps = {
    incognito: false,
    onSeeResult: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: image gate resolved (button enabled)
    mockUseScreening.mockReturnValue({ imageGateResolved: true });
  });

  describe('basic rendering', () => {
    it('renders saved message for non-incognito mode', () => {
      render(<ChatFinished {...defaultProps} incognito={false} />);

      expect(screen.getByText('Saved')).toBeInTheDocument();
    });

    it('renders saved incognito message for incognito mode', () => {
      render(<ChatFinished {...defaultProps} incognito={true} />);

      expect(screen.getByText('Saved (incognito)')).toBeInTheDocument();
    });

    it('renders "Lihat Hasil" button', () => {
      render(<ChatFinished {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Lihat Hasil' })).toBeInTheDocument();
    });
  });

  describe('button gating based on imageGateResolved', () => {
    it('enables button when imageGateResolved is true', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: true });
      render(<ChatFinished {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Lihat Hasil' });
      expect(button).not.toBeDisabled();
    });

    it('disables button when imageGateResolved is false', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Lihat Hasil' });
      expect(button).toBeDisabled();
    });

    it('shows waiting hint when imageGateResolved is false', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} />);

      expect(screen.getByText('Menunggu foto...')).toBeInTheDocument();
    });

    it('hides waiting hint when imageGateResolved is true', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: true });
      render(<ChatFinished {...defaultProps} />);

      expect(screen.queryByText('Menunggu foto...')).not.toBeInTheDocument();
    });

    it('waiting hint has pulse animation', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} />);

      const hint = screen.getByText('Menunggu foto...');
      expect(hint).toHaveClass('animate-pulse');
    });
  });

  describe('upload entry point', () => {
    /**
     * The design names a single entry point for image submission: the "+"
     * button in InputBar. ChatFinished must not grow a competing one.
     */
    it('renders no upload control of its own while the gate is unresolved', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} />);

      // "Lihat Hasil" is the only button this footer owns.
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Lihat Hasil' })).toBeInTheDocument();
    });
  });

  describe('button interaction', () => {
    it('calls onSeeResult when button clicked and gate resolved', () => {
      const onSeeResult = vi.fn();
      mockUseScreening.mockReturnValue({ imageGateResolved: true });
      render(<ChatFinished {...defaultProps} onSeeResult={onSeeResult} />);

      fireEvent.click(screen.getByRole('button', { name: 'Lihat Hasil' }));

      expect(onSeeResult).toHaveBeenCalledTimes(1);
    });

    it('does not call onSeeResult when button clicked and gate unresolved', () => {
      const onSeeResult = vi.fn();
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} onSeeResult={onSeeResult} />);

      const button = screen.getByRole('button', { name: 'Lihat Hasil' });
      fireEvent.click(button);

      // Button is disabled, so click should not trigger the handler
      expect(onSeeResult).not.toHaveBeenCalled();
    });
  });

  describe('requirements validation', () => {
    /**
     * Validates: Requirements 2.3
     * WHILE the Image_Upload_Gate is unresolved, THE Visual_Detection_Feature
     * SHALL hide or disable the "Lihat Hasil" action available at chat completion
     */
    it('disables "Lihat Hasil" while image gate is unresolved (Req 2.3)', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: false });
      render(<ChatFinished {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Lihat Hasil' });
      expect(button).toBeDisabled();
    });

    /**
     * Validates: Requirements 2.4
     * WHEN the Image_Upload_Gate becomes resolved, THE Visual_Detection_Feature
     * SHALL enable the "Lihat Hasil" action
     */
    it('enables "Lihat Hasil" when image gate becomes resolved (Req 2.4)', () => {
      mockUseScreening.mockReturnValue({ imageGateResolved: true });
      render(<ChatFinished {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Lihat Hasil' });
      expect(button).not.toBeDisabled();
    });
  });
});
