import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidancePreview } from './GuidancePreview';
import type { GuidanceInfo } from './PlaygroundContext';

const sampleGuidance: GuidanceInfo = {
  instruction: 'EXPLORE',
  targetCategory: 'lokasi_tubuh',
  isFollowUp: false,
  reason: 'lokasi_tubuh belum covered',
};

describe('GuidancePreview', () => {
  it('renders nothing when guidance is null', () => {
    const { container } = render(<GuidancePreview guidance={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders full variant with all fields', () => {
    render(<GuidancePreview guidance={sampleGuidance} variant="full" />);
    expect(screen.getByText('EXPLORE')).toBeDefined();
    expect(screen.getByText('lokasi_tubuh')).toBeDefined();
    expect(screen.getByText('No')).toBeDefined();
    expect(screen.getByText('lokasi_tubuh belum covered')).toBeDefined();
    expect(screen.getByText(/tidak mengubah prompt/i)).toBeDefined();
  });

  it('renders badge variant as compact inline', () => {
    render(<GuidancePreview guidance={sampleGuidance} variant="badge" />);
    expect(screen.getByText(/Turn 1: EXPLORE lokasi_tubuh/)).toBeDefined();
  });

  it('renders targetCategory as "—" when null in full variant', () => {
    const completeGuidance: GuidanceInfo = {
      instruction: 'COMPLETE',
      targetCategory: null,
      isFollowUp: false,
      reason: 'Semua kategori covered',
    };
    render(<GuidancePreview guidance={completeGuidance} variant="full" />);
    expect(screen.getByText('—')).toBeDefined();
  });
});
