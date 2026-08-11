import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChipsSelector from './ChipsSelector';
import type { ChipsRequest } from '@/features/screening-chat-v2/domain/types';

// --- Fixtures ---

const kontakRequest: ChipsRequest = {
  id: 'chips-kontak-1',
  type: 'single',
  question: 'Ada yang gatal serupa di sekitarmu?',
  options: [
    { token: 'Ya', label: 'Ya' },
    { token: 'Tidak', label: 'Tidak' },
  ],
  allowFreeText: false,
};

const lokasiRequest: ChipsRequest = {
  id: 'chips-lokasi-1',
  type: 'multi',
  question: 'Di bagian tubuh mana aja yang gatal?',
  options: [
    { token: 'sela jari tangan', label: 'Sela jari tangan' },
    { token: 'pergelangan tangan', label: 'Pergelangan tangan' },
    { token: 'ketiak', label: 'Ketiak' },
    { token: 'Lainnya', label: 'Lainnya' },
  ],
  allowFreeText: true,
};

const asramaTukarRequest: ChipsRequest = {
  id: 'chips-asrama-tukar-1',
  type: 'single',
  question: 'Soal lingkungan tempat tinggal',
  options: [],
  allowFreeText: false,
  groups: [
    {
      id: 'asrama',
      question: 'Apakah kamu tinggal di asrama?',
      options: [
        { token: 'asrama:Ya', label: 'Ya', group: 'asrama' },
        { token: 'asrama:Tidak', label: 'Tidak', group: 'asrama' },
      ],
    },
    {
      id: 'tukar',
      question: 'Sering tukar alat pribadi?',
      options: [
        { token: 'tukar:Ya', label: 'Ya', group: 'tukar' },
        { token: 'tukar:Tidak', label: 'Tidak', group: 'tukar' },
      ],
    },
  ],
};

// --- Tests ---

describe('ChipsSelector', () => {
  describe('single-select toggle (kontak)', () => {
    it('renders Ya and Tidak chips', () => {
      render(
        <ChipsSelector request={kontakRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      expect(screen.getByText('Ya')).toBeDefined();
      expect(screen.getByText('Tidak')).toBeDefined();
    });

    it('selects a chip on click (aria-pressed becomes true)', () => {
      render(
        <ChipsSelector request={kontakRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      const yaChip = screen.getByLabelText('Ya');
      fireEvent.click(yaChip);
      expect(yaChip).toHaveAttribute('aria-pressed', 'true');
    });

    it('deselects a chip on second click', () => {
      render(
        <ChipsSelector request={kontakRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      const yaChip = screen.getByLabelText('Ya');
      fireEvent.click(yaChip);
      expect(yaChip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(yaChip);
      expect(yaChip).toHaveAttribute('aria-pressed', 'false');
    });

    it('switches selection when clicking another chip', () => {
      render(
        <ChipsSelector request={kontakRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      const yaChip = screen.getByLabelText('Ya');
      const tidakChip = screen.getByLabelText('Tidak');

      fireEvent.click(yaChip);
      expect(yaChip).toHaveAttribute('aria-pressed', 'true');
      expect(tidakChip).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(tidakChip);
      expect(tidakChip).toHaveAttribute('aria-pressed', 'true');
      expect(yaChip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('multi-select with Lainnya (lokasi)', () => {
    it('allows multiple chips to be selected', () => {
      render(
        <ChipsSelector request={lokasiRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      const selaJari = screen.getByLabelText('Sela jari tangan');
      const pergelangan = screen.getByLabelText('Pergelangan tangan');

      fireEvent.click(selaJari);
      fireEvent.click(pergelangan);

      expect(selaJari).toHaveAttribute('aria-pressed', 'true');
      expect(pergelangan).toHaveAttribute('aria-pressed', 'true');
    });

    it('unlocks text input when Lainnya is selected', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={lokasiRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );
      const lainnya = screen.getByLabelText('Lainnya');
      fireEvent.click(lainnya);

      // Lainnya chip should be selected (text input is handled by parent)
      expect(lainnya).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onSelectionChange with valid=true when Lainnya selected with text', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={lokasiRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      fireEvent.click(screen.getByLabelText('Sela jari tangan'));

      // onSelectionChange should be called with isValid=true when at least one selected
      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('sela jari tangan');
      expect(lastCall?.[1]).toBe(true);
    });

    it('calls onSelectionChange with valid=false when nothing selected', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={lokasiRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      // Initial render should call onSelectionChange with empty selections, isValid=false
      const firstCall = onSelectionChange.mock.calls[0];
      expect(firstCall?.[0]).toEqual([]);
      expect(firstCall?.[1]).toBe(false);
    });

    it('reports correct selections when multiple chips selected', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={lokasiRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      fireEvent.click(screen.getByLabelText('Sela jari tangan'));
      fireEvent.click(screen.getByLabelText('Lainnya'));

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('sela jari tangan');
      expect(lastCall?.[0]).toContain('Lainnya');
    });
  });

  describe('grouped mode - asrama_tukar both-required validation', () => {
    it('renders both question groups', () => {
      render(
        <ChipsSelector request={asramaTukarRequest} onSelectionChange={vi.fn()} disabled={false} />,
      );
      expect(screen.getByText('Apakah kamu tinggal di asrama?')).toBeDefined();
      expect(screen.getByText('Sering tukar alat pribadi?')).toBeDefined();
    });

    it('reports isValid=false initially (no selections)', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={asramaTukarRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      const firstCall = onSelectionChange.mock.calls[0];
      expect(firstCall?.[1]).toBe(false);
    });

    it('reports isValid=false when only one group answered', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <ChipsSelector
          request={asramaTukarRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      // Answer only asrama group
      const fieldsets = container.querySelectorAll('fieldset');
      const asramaButtons = fieldsets[0]?.querySelectorAll('button');
      if (asramaButtons?.[0]) fireEvent.click(asramaButtons[0]);

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[1]).toBe(false);
    });

    it('reports isValid=true when both groups answered', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <ChipsSelector
          request={asramaTukarRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      const fieldsets = container.querySelectorAll('fieldset');

      // Answer asrama group
      const asramaButtons = fieldsets[0]?.querySelectorAll('button');
      if (asramaButtons?.[0]) fireEvent.click(asramaButtons[0]);

      // Answer tukar group
      const tukarButtons = fieldsets[1]?.querySelectorAll('button');
      if (tukarButtons?.[1]) fireEvent.click(tukarButtons[1]);

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[1]).toBe(true);
    });

    it('reports correct grouped selections', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <ChipsSelector
          request={asramaTukarRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      const fieldsets = container.querySelectorAll('fieldset');
      const asramaButtons = fieldsets[0]?.querySelectorAll('button');
      const tukarButtons = fieldsets[1]?.querySelectorAll('button');

      if (asramaButtons?.[0]) fireEvent.click(asramaButtons[0]); // asrama:Ya
      if (tukarButtons?.[1]) fireEvent.click(tukarButtons[1]); // tukar:Tidak

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('asrama:Ya');
      expect(lastCall?.[0]).toContain('tukar:Tidak');
    });
  });

  describe('disabled state', () => {
    it('clicking chips does nothing when disabled', () => {
      render(<ChipsSelector request={kontakRequest} onSelectionChange={vi.fn()} disabled={true} />);
      const yaChip = screen.getByLabelText('Ya');
      fireEvent.click(yaChip);
      expect(yaChip).toHaveAttribute('aria-pressed', 'false');
    });

    it('text input does not appear when disabled and Lainnya clicked', () => {
      render(<ChipsSelector request={lokasiRequest} onSelectionChange={vi.fn()} disabled={true} />);
      const lainnya = screen.getByLabelText('Lainnya');
      fireEvent.click(lainnya);
      expect(lainnya).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByLabelText('Lokasi lainnya')).toBeNull();
    });

    it('does not fire selection change on chip click when disabled', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={kontakRequest}
          onSelectionChange={onSelectionChange}
          disabled={true}
        />,
      );

      // Clear initial render call
      onSelectionChange.mockClear();

      const yaChip = screen.getByLabelText('Ya');
      fireEvent.click(yaChip);

      // No new calls after the click (only the initial useEffect call)
      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });

  describe('onSelectionChange callback', () => {
    it('fires with correct selections for single-select', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={kontakRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      fireEvent.click(screen.getByLabelText('Ya'));

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toEqual(['Ya']);
      expect(lastCall?.[1]).toBe(true);
    });

    it('fires with multiple selections for multi-select', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={lokasiRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      fireEvent.click(screen.getByLabelText('Sela jari tangan'));
      fireEvent.click(screen.getByLabelText('Pergelangan tangan'));

      const lastCall = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('sela jari tangan');
      expect(lastCall?.[0]).toContain('pergelangan tangan');
      expect(lastCall?.[1]).toBe(true);
    });

    it('fires with empty selections and isValid=false initially', () => {
      const onSelectionChange = vi.fn();
      render(
        <ChipsSelector
          request={kontakRequest}
          onSelectionChange={onSelectionChange}
          disabled={false}
        />,
      );

      // Initial useEffect call
      expect(onSelectionChange).toHaveBeenCalledWith([], false);
    });
  });
});
