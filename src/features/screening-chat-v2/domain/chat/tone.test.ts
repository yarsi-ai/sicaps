import { describe, it, expect } from 'vitest';

import { determineToneTheme, buildToneDirective } from './tone';

describe('determineToneTheme', () => {
  it('returns playful for ELEMENTARY education level', () => {
    const result = determineToneTheme('ELEMENTARY');

    expect(result).toBe('playful');
  });

  it('returns hybrid for JUNIOR_HIGH education level', () => {
    const result = determineToneTheme('JUNIOR_HIGH');

    expect(result).toBe('hybrid');
  });

  it('returns hybrid for SENIOR_HIGH education level', () => {
    const result = determineToneTheme('SENIOR_HIGH');

    expect(result).toBe('hybrid');
  });

  it('returns hybrid when education level is null', () => {
    const result = determineToneTheme(null);

    expect(result).toBe('hybrid');
  });
});

describe('buildToneDirective', () => {
  it('includes Playful label for playful theme', () => {
    const result = buildToneDirective('playful');

    expect(result).toContain('Playful');
  });

  it('includes emoji directive for playful theme', () => {
    const result = buildToneDirective('playful');

    expect(result).toContain('emoji');
  });

  it('includes gaul directive for playful theme', () => {
    const result = buildToneDirective('playful');

    expect(result).toContain('gaul');
  });

  it('includes simpel directive for playful theme', () => {
    const result = buildToneDirective('playful');

    expect(result).toContain('simpel');
  });

  it('includes Hybrid label for hybrid theme', () => {
    const result = buildToneDirective('hybrid');

    expect(result).toContain('Hybrid');
  });

  it('includes informatif directive for hybrid theme', () => {
    const result = buildToneDirective('hybrid');

    expect(result).toContain('informatif');
  });

  it('includes casual directive for hybrid theme', () => {
    const result = buildToneDirective('hybrid');

    expect(result).toContain('casual');
  });

  it('does NOT include informatif in playful theme', () => {
    const result = buildToneDirective('playful');

    expect(result).not.toContain('informatif');
  });

  it('does NOT include gaul in hybrid theme', () => {
    const result = buildToneDirective('hybrid');

    expect(result).not.toContain('gaul');
  });
});
