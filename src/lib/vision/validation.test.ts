import { describe, it, expect } from 'vitest';
import { isAllowedMimeType, isWithinSizeLimit } from './validation';
import { CONFIG } from '@/lib/config';

describe('isAllowedMimeType', () => {
  it('accepts image/jpeg', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
  });

  it('accepts image/png', () => {
    expect(isAllowedMimeType('image/png')).toBe(true);
  });

  it('accepts image/webp', () => {
    expect(isAllowedMimeType('image/webp')).toBe(true);
  });

  it('accepts image/heic', () => {
    expect(isAllowedMimeType('image/heic')).toBe(true);
  });

  it('accepts image/heif', () => {
    expect(isAllowedMimeType('image/heif')).toBe(true);
  });

  it('accepts image/gif', () => {
    expect(isAllowedMimeType('image/gif')).toBe(true);
  });

  it('accepts image/bmp', () => {
    expect(isAllowedMimeType('image/bmp')).toBe(true);
  });

  it('accepts image/tiff', () => {
    expect(isAllowedMimeType('image/tiff')).toBe(true);
  });

  it('rejects image/svg+xml', () => {
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
  });

  it('rejects application/pdf', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(false);
  });

  it('rejects text/plain', () => {
    expect(isAllowedMimeType('text/plain')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedMimeType('')).toBe(false);
  });

  it('rejects case variations (IMAGE/JPEG)', () => {
    expect(isAllowedMimeType('IMAGE/JPEG')).toBe(false);
  });

  it('rejects with extra whitespace', () => {
    expect(isAllowedMimeType(' image/jpeg ')).toBe(false);
  });
});

describe('isWithinSizeLimit', () => {
  const MAX_SIZE = CONFIG.visualDetection.MAX_FILE_SIZE_BYTES; // 10MB = 10,485,760 bytes

  it('accepts file at minimum size (1 byte)', () => {
    expect(isWithinSizeLimit(1)).toBe(true);
  });

  it('accepts small file (1KB)', () => {
    expect(isWithinSizeLimit(1024)).toBe(true);
  });

  it('accepts medium file (5MB)', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024)).toBe(true);
  });

  it('accepts file at exactly max size (10MB)', () => {
    expect(isWithinSizeLimit(MAX_SIZE)).toBe(true);
  });

  it('rejects file 1 byte over max size', () => {
    expect(isWithinSizeLimit(MAX_SIZE + 1)).toBe(false);
  });

  it('rejects file significantly over max size (20MB)', () => {
    expect(isWithinSizeLimit(20 * 1024 * 1024)).toBe(false);
  });

  it('rejects zero size', () => {
    expect(isWithinSizeLimit(0)).toBe(false);
  });

  it('rejects negative size', () => {
    expect(isWithinSizeLimit(-1)).toBe(false);
  });

  it('rejects very large negative size', () => {
    expect(isWithinSizeLimit(-10 * 1024 * 1024)).toBe(false);
  });
});
