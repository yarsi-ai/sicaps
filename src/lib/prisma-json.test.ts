import { describe, it, expect } from 'vitest';

import { parseCategoriesCovered, parseScores } from './prisma-json';

describe('parseScores', () => {
  it('returns the object when input is a valid Record<string, number>', () => {
    const input = { intensitas: 2, waktu: 1 };
    expect(parseScores(input)).toEqual({ intensitas: 2, waktu: 1 });
  });

  it('returns empty object for null', () => {
    expect(parseScores(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(parseScores(undefined)).toEqual({});
  });

  it('returns empty object for an array', () => {
    expect(parseScores([1, 2, 3])).toEqual({});
  });

  it('returns empty object for a string', () => {
    expect(parseScores('hello')).toEqual({});
  });

  it('returns empty object for a number', () => {
    expect(parseScores(42)).toEqual({});
  });

  it('returns the object for an empty object', () => {
    expect(parseScores({})).toEqual({});
  });
});

describe('parseCategoriesCovered', () => {
  it('returns the array when input is a valid string[]', () => {
    const input = ['intensitas', 'waktu'];
    expect(parseCategoriesCovered(input)).toEqual(['intensitas', 'waktu']);
  });

  it('returns empty array for null', () => {
    expect(parseCategoriesCovered(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseCategoriesCovered(undefined)).toEqual([]);
  });

  it('returns empty array for an object', () => {
    expect(parseCategoriesCovered({ foo: 'bar' })).toEqual([]);
  });

  it('returns empty array for a string', () => {
    expect(parseCategoriesCovered('hello')).toEqual([]);
  });

  it('returns empty array for a number', () => {
    expect(parseCategoriesCovered(42)).toEqual([]);
  });

  it('returns the array for an empty array', () => {
    expect(parseCategoriesCovered([])).toEqual([]);
  });
});
