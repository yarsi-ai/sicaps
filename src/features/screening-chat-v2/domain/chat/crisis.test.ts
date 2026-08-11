import { describe, it, expect } from 'vitest';

import { checkCrisis } from './crisis';
import { getBotText } from './bot-text';

describe('checkCrisis', () => {
  describe('high severity detection', () => {
    it('detects "bunuh diri" as high severity', () => {
      const result = checkCrisis('saya ingin bunuh diri');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
      expect(result.response).toContain('segera hubungi');
    });

    it('detects "mau mati" as high severity', () => {
      const result = checkCrisis('aku mau mati saja');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "kill myself" as high severity', () => {
      const result = checkCrisis('I want to kill myself');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "end my life" as high severity', () => {
      const result = checkCrisis('I want to end my life');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "self harm" as high severity', () => {
      const result = checkCrisis('thinking about self harm');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "tidak mau hidup" as high severity', () => {
      const result = checkCrisis('aku tidak mau hidup lagi');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "ingin mengakhiri" as high severity', () => {
      const result = checkCrisis('saya ingin mengakhiri semuanya');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "ingin menyakiti diri" as high severity', () => {
      const result = checkCrisis('saya ingin menyakiti diri sendiri');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "hurt myself" as high severity', () => {
      const result = checkCrisis('I want to hurt myself');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects "want to die" as high severity', () => {
      const result = checkCrisis('I just want to die');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });
  });

  describe('low severity detection', () => {
    it('detects "sangat tertekan" as low severity', () => {
      const result = checkCrisis('saya sangat tertekan dengan kondisi ini');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
      expect(result.response).toContain('bicara sama ustadz');
    });

    it('detects "tidak kuat" as low severity', () => {
      const result = checkCrisis('saya tidak kuat lagi');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "putus asa" as low severity', () => {
      const result = checkCrisis('saya merasa putus asa');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "sangat malu" as low severity', () => {
      const result = checkCrisis('saya sangat malu dengan penyakit ini');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "very stressed" as low severity', () => {
      const result = checkCrisis('I am very stressed about this');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "can\'t take it" as low severity', () => {
      const result = checkCrisis("I can't take it anymore");

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "hopeless" as low severity', () => {
      const result = checkCrisis('feeling hopeless right now');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('detects "very ashamed" as low severity', () => {
      const result = checkCrisis('I feel very ashamed');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });
  });

  describe('no detection', () => {
    it('returns not detected for normal message', () => {
      const result = checkCrisis('saya gatal di tangan sejak 3 hari lalu');

      expect(result.detected).toBe(false);
      expect(result.severity).toBe('low');
      expect(result.response).toBeUndefined();
    });

    it('returns not detected for empty message', () => {
      const result = checkCrisis('');

      expect(result.detected).toBe(false);
      expect(result.severity).toBe('low');
    });

    it('returns not detected for unrelated distress words', () => {
      const result = checkCrisis('saya sedih karena gatal terus');

      expect(result.detected).toBe(false);
      expect(result.severity).toBe('low');
    });
  });

  describe('case insensitivity', () => {
    it('detects uppercase HIGH keywords', () => {
      const result = checkCrisis('SAYA INGIN BUNUH DIRI');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('detects mixed-case LOW keywords', () => {
      const result = checkCrisis('Saya Sangat Tertekan');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('low');
    });
  });

  describe('priority: high over low', () => {
    it('returns high severity when both high and low keywords present', () => {
      const result = checkCrisis('saya sangat tertekan dan ingin bunuh diri');

      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });
  });
});

describe('checkCrisis locale handling', () => {
  it('returns the Indonesian escalation by default', () => {
    const result = checkCrisis('aku mau mati');

    expect(result.detected).toBe(true);
    expect(result.response).toBe(getBotText('id').crisis.high);
  });

  it('returns the English escalation for the en locale', () => {
    const result = checkCrisis('I want to die', 'en');

    expect(result.detected).toBe(true);
    expect(result.severity).toBe('high');
    expect(result.response).toBe(getBotText('en').crisis.high);
  });

  it('returns the English support message for low severity', () => {
    const result = checkCrisis('I am being bullied', 'en');

    expect(result.detected).toBe(true);
    expect(result.severity).toBe('low');
    expect(result.response).toBe(getBotText('en').crisis.low);
  });

  it('detects Indonesian keywords even on an English session', () => {
    const result = checkCrisis('aku mau mati', 'en');

    expect(result.detected).toBe(true);
    expect(result.response).toBe(getBotText('en').crisis.high);
  });

  it('detects English keywords even on an Indonesian session', () => {
    const result = checkCrisis('I want to die', 'id');

    expect(result.detected).toBe(true);
    expect(result.response).toBe(getBotText('id').crisis.high);
  });

  it('reports no detection for an ordinary complaint in either locale', () => {
    expect(checkCrisis('gatal di sela jari', 'id').detected).toBe(false);
    expect(checkCrisis('itchy between my fingers', 'en').detected).toBe(false);
  });
});
