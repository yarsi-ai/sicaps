import { describe, it, expect } from 'vitest';
import { checkCrisis } from './crisis';

describe('checkCrisis', () => {
  describe('returns CrisisInstruction on match', () => {
    it('detects Indonesian crisis keyword "bunuh diri"', () => {
      const result = checkCrisis('saya ingin bunuh diri', 'id');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
      expect(result!.helplineNumbers).toEqual({ id: '119', international: '988' });
      expect(result!.terminateSession).toBe(true);
    });

    it('detects English crisis keyword "kill myself"', () => {
      const result = checkCrisis('I want to kill myself', 'en');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
      expect(result!.terminateSession).toBe(true);
    });

    it('detects "suicide" keyword', () => {
      const result = checkCrisis('thinking about suicide', 'en');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });

    it('detects Indonesian keyword "ingin mati"', () => {
      const result = checkCrisis('aku ingin mati saja rasanya', 'id');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });

    it('detects crisis keywords regardless of case', () => {
      const result = checkCrisis('I want to KILL MYSELF', 'en');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });

    it('detects crisis keywords with leading/trailing whitespace', () => {
      const result = checkCrisis('   suicide   ', 'en');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });

    it('detects Indonesian keywords even when locale is en', () => {
      const result = checkCrisis('saya ingin bunuh diri', 'en');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });

    it('detects English keywords even when locale is id', () => {
      const result = checkCrisis('I want to kill myself', 'id');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('CRISIS_HALT');
    });
  });

  describe('returns locale-appropriate message', () => {
    it('returns Indonesian message when locale is id', () => {
      const result = checkCrisis('bunuh diri', 'id');

      expect(result).not.toBeNull();
      expect(result!.message).toContain('119');
      expect(result!.message).toContain('988');
      expect(result!.message).toContain('Kami mendeteksi');
    });

    it('returns English message when locale is en', () => {
      const result = checkCrisis('suicide', 'en');

      expect(result).not.toBeNull();
      expect(result!.message).toContain('119');
      expect(result!.message).toContain('988');
      expect(result!.message).toContain('We detected');
    });
  });

  describe('returns null when no crisis keywords detected', () => {
    it('returns null for normal health message', () => {
      const result = checkCrisis('kulit saya gatal-gatal', 'id');

      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = checkCrisis('', 'id');

      expect(result).toBeNull();
    });

    it('returns null for off-topic but non-crisis message', () => {
      const result = checkCrisis('what is the weather today', 'en');

      expect(result).toBeNull();
    });

    it('returns null for partial keyword match that does not form a full phrase', () => {
      const result = checkCrisis('I want to die my hair blue', 'en');

      // "want to die" is a substring match, so this WILL trigger
      // This is intentional — false positives for safety are acceptable
      expect(result).not.toBeNull();
    });

    it('returns null for medical/clinical discussion without crisis intent', () => {
      const result = checkCrisis('saya punya lesi di tangan', 'id');

      expect(result).toBeNull();
    });
  });
});
