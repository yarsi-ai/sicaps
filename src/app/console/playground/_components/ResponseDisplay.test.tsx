import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResponseDisplay } from './ResponseDisplay';

afterEach(cleanup);

describe('ResponseDisplay', () => {
  it('renders loading skeleton when loading is true', () => {
    const { container } = render(<ResponseDisplay reply="" extraction={null} loading={true} />);

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders error state when error is provided', () => {
    render(<ResponseDisplay reply="" extraction={null} error="Provider not configured" />);

    expect(screen.getByText('Error')).toBeDefined();
    expect(screen.getByText('Provider not configured')).toBeDefined();
  });

  it('renders parsed reply text', () => {
    render(<ResponseDisplay reply="Apakah Anda merasakan gatal?" extraction={null} />);

    expect(screen.getByText('Apakah Anda merasakan gatal?')).toBeDefined();
  });

  it('renders extraction keywords grouped by category', () => {
    const extraction = {
      intensitas: [
        { keyword: 'gatal malam', confidence: 'HIGH' },
        { keyword: 'sangat gatal', confidence: 'MEDIUM' },
      ],
      lokasi_tubuh: [{ keyword: 'sela jari', confidence: 'HIGH' }],
    };

    render(<ResponseDisplay reply="test" extraction={extraction} />);

    expect(screen.getByText('intensitas')).toBeDefined();
    expect(screen.getByText('lokasi_tubuh')).toBeDefined();
    expect(screen.getByText(/gatal malam/)).toBeDefined();
    expect(screen.getByText(/sela jari/)).toBeDefined();
  });

  it('does not render extraction section when extraction is null', () => {
    render(<ResponseDisplay reply="hello" extraction={null} />);

    expect(screen.queryByText('Extraction')).toBeNull();
  });

  it('does not render extraction section when extraction is empty', () => {
    render(<ResponseDisplay reply="hello" extraction={{}} />);

    expect(screen.queryByText('Extraction')).toBeNull();
  });

  it('renders collapsible raw JSON section collapsed by default', () => {
    const rawJson = '{"reply":"test","extraction":{}}';

    render(<ResponseDisplay reply="test" extraction={null} rawJson={rawJson} />);

    // Button visible, content hidden
    expect(screen.getByText('Raw JSON')).toBeDefined();
    expect(screen.queryByText(/"reply"/)).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText('Raw JSON'));
    expect(screen.getByText(/"reply"/)).toBeDefined();
  });

  it('renders metadata bar when metadata is provided', () => {
    render(
      <ResponseDisplay
        reply="test"
        extraction={null}
        metadata={{
          latencyMs: 250,
          model: 'llama-3.1-8b-instant',
          tokensUsed: { input: 40, output: 20 },
          provider: 'groq',
        }}
      />,
    );

    expect(screen.getByText('250ms')).toBeDefined();
    expect(screen.getByText('llama-3.1-8b-instant')).toBeDefined();
    expect(screen.getByText('40 in / 20 out')).toBeDefined();
  });

  it('does not render error when error is null', () => {
    render(<ResponseDisplay reply="hello" extraction={null} error={null} />);

    expect(screen.queryByText('Error')).toBeNull();
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('highlights extraction keywords when highlightKeywords is provided', () => {
    const extraction = {
      intensitas: [
        { keyword: 'gatal malam', confidence: 'HIGH' },
        { keyword: 'ringan', confidence: 'LOW' },
      ],
    };
    const highlighted = new Set(['gatal malam']);

    const { container } = render(
      <ResponseDisplay
        reply="test"
        extraction={extraction}
        highlightKeywords={highlighted}
        highlightColor="blue"
      />,
    );

    // The highlighted keyword should have blue styling
    const spans = container.querySelectorAll('span.ring-1');
    expect(spans.length).toBe(1);
  });
});
