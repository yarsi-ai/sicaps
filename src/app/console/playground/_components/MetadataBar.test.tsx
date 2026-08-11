import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetadataBar } from './MetadataBar';

afterEach(cleanup);

describe('MetadataBar', () => {
  it('renders latency badge with ms suffix', () => {
    render(
      <MetadataBar
        latencyMs={450}
        model="llama-3.1-8b-instant"
        tokensUsed={null}
        provider="groq"
      />,
    );

    expect(screen.getByText('450ms')).toBeDefined();
  });

  it('renders provider and model in single badge', () => {
    render(
      <MetadataBar
        latencyMs={200}
        model="llama-3.1-8b-instant"
        tokensUsed={null}
        provider="groq"
      />,
    );

    expect(screen.getByText('groq')).toBeDefined();
    expect(screen.getByText('llama-3.1-8b-instant')).toBeDefined();
  });

  it('renders tokens badge when tokensUsed is provided', () => {
    render(
      <MetadataBar
        latencyMs={300}
        model="qwen2.5:7b"
        tokensUsed={{ input: 50, output: 30 }}
        provider="ollama"
      />,
    );

    expect(screen.getByText('50 in / 30 out')).toBeDefined();
  });

  it('does not render tokens badge when tokensUsed is null', () => {
    render(
      <MetadataBar latencyMs={100} model="gemini-2.5-flash" tokensUsed={null} provider="gemini" />,
    );

    expect(screen.queryByText(/\d+ in \/ \d+ out/)).toBeNull();
  });
});
