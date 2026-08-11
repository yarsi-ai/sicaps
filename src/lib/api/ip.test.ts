import { describe, expect, it } from 'vitest';

import { getClientIp } from './ip';

function makeHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

describe('getClientIp', () => {
  it('returns first IP from x-forwarded-for header', () => {
    expect(getClientIp(makeHeaders({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }))).toBe(
      '203.0.113.1',
    );
  });

  it('trims whitespace from x-forwarded-for value', () => {
    expect(getClientIp(makeHeaders({ 'x-forwarded-for': '  192.168.1.1 , 10.0.0.1' }))).toBe(
      '192.168.1.1',
    );
  });

  it('returns single IP from x-forwarded-for without comma', () => {
    expect(getClientIp(makeHeaders({ 'x-forwarded-for': '172.16.0.1' }))).toBe('172.16.0.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(makeHeaders({ 'x-real-ip': '10.0.0.5' }))).toBe('10.0.0.5');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    expect(
      getClientIp(makeHeaders({ 'x-forwarded-for': '203.0.113.1', 'x-real-ip': '10.0.0.5' })),
    ).toBe('203.0.113.1');
  });

  it('returns 127.0.0.1 when no IP headers are present', () => {
    expect(getClientIp(makeHeaders())).toBe('127.0.0.1');
  });
});
