import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { verifyPin } from './pin';

describe('verifyPin', () => {
  const CONFIGURED_PIN = 'secret123';

  describe('exact match', () => {
    it('returns true when submitted PIN matches configured PIN exactly', () => {
      expect(verifyPin('secret123', CONFIGURED_PIN)).toBe(true);
    });

    it('returns true for longer valid PINs', () => {
      const longPin = 'a'.repeat(128);
      expect(verifyPin(longPin, longPin)).toBe(true);
    });
  });

  describe('case sensitivity', () => {
    it('returns false when case differs', () => {
      expect(verifyPin('SECRET123', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('Secret123', CONFIGURED_PIN)).toBe(false);
    });
  });

  describe('incorrect PIN', () => {
    it('returns false when PIN is completely different', () => {
      expect(verifyPin('wrongpin', CONFIGURED_PIN)).toBe(false);
    });

    it('returns false when PIN differs by one character', () => {
      expect(verifyPin('secret124', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('secret12', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('secret1234', CONFIGURED_PIN)).toBe(false);
    });

    it('returns false for partial match at start', () => {
      expect(verifyPin('secret', CONFIGURED_PIN)).toBe(false);
    });

    it('returns false for partial match at end', () => {
      expect(verifyPin('123', CONFIGURED_PIN)).toBe(false);
    });
  });

  describe('empty and whitespace handling', () => {
    it('returns false for empty string', () => {
      expect(verifyPin('', CONFIGURED_PIN)).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(verifyPin('   ', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('\t', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('\n', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin(' \t\n ', CONFIGURED_PIN)).toBe(false);
    });

    it('does not trim submitted PIN during comparison', () => {
      // A PIN with leading/trailing spaces is different from one without
      expect(verifyPin(' secret123', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('secret123 ', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin(' secret123 ', CONFIGURED_PIN)).toBe(false);
    });
  });

  describe('special characters', () => {
    it('handles PINs with special characters', () => {
      const specialPin = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(verifyPin(specialPin, specialPin)).toBe(true);
      expect(verifyPin(specialPin, CONFIGURED_PIN)).toBe(false);
    });

    it('handles PINs with Unicode characters', () => {
      const unicodePin = 'пароль密码🔑';
      expect(verifyPin(unicodePin, unicodePin)).toBe(true);
      expect(verifyPin(unicodePin, CONFIGURED_PIN)).toBe(false);
    });
  });

  describe('timing safety', () => {
    // Note: We cannot truly test timing safety in unit tests.
    // This test documents the expected behavior and verifies the function works
    // regardless of how similar the PINs are.
    it('handles PINs of different lengths consistently', () => {
      expect(verifyPin('a', CONFIGURED_PIN)).toBe(false);
      expect(verifyPin('secret123456789', CONFIGURED_PIN)).toBe(false);
    });

    it('handles comparison when both PINs are identical length but different', () => {
      expect(verifyPin('xxxxxxxxx', CONFIGURED_PIN)).toBe(false);
    });
  });

  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     * Property 3: Incorrect PIN denial is generic — any submitted PIN that does not
     * exactly match the configured PIN returns false.
     */
    describe('Property 3: Incorrect PIN denial is generic', () => {
      it('returns false for any arbitrary string that differs from configured PIN', () => {
        fc.assert(
          fc.property(fc.string(), (submittedPin) => {
            // Skip if we accidentally generate the exact configured PIN
            if (submittedPin === CONFIGURED_PIN) return;
            expect(verifyPin(submittedPin, CONFIGURED_PIN)).toBe(false);
          }),
          { numRuns: 100 },
        );
      });

      it('returns true when submitted PIN exactly matches configured PIN', () => {
        fc.assert(
          fc.property(
            // Generate random PINs as configured PIN
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            (configuredPin) => {
              // The exact same PIN should always return true
              expect(verifyPin(configuredPin, configuredPin)).toBe(true);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for PINs that differ by one character', () => {
        fc.assert(
          fc.property(
            // Generate non-trivial PINs (min 2 chars, non-whitespace)
            fc.string({ minLength: 2 }).filter((s) => s.trim().length >= 2),
            fc.nat({ max: 100 }), // Position to modify
            fc.string({ minLength: 1, maxLength: 1 }), // Single character replacement
            (configuredPin, positionSeed, replacementChar) => {
              const position = positionSeed % configuredPin.length;
              const original = configuredPin[position];

              // Only test if replacement creates a different string
              if (replacementChar === original) return;

              const modifiedPin =
                configuredPin.substring(0, position) +
                replacementChar +
                configuredPin.substring(position + 1);

              // A PIN differing by one character should still return false
              expect(verifyPin(modifiedPin, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for PINs with additional characters prepended', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // configured PIN
            fc.string({ minLength: 1 }), // prefix to prepend
            (configuredPin, prefix) => {
              const modifiedPin = prefix + configuredPin;
              // Skip if the prefix is empty or if it results in same string
              if (modifiedPin === configuredPin) return;
              expect(verifyPin(modifiedPin, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for PINs with additional characters appended', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // configured PIN
            fc.string({ minLength: 1 }), // suffix to append
            (configuredPin, suffix) => {
              const modifiedPin = configuredPin + suffix;
              // Skip if the suffix is empty or if it results in same string
              if (modifiedPin === configuredPin) return;
              expect(verifyPin(modifiedPin, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for empty string against any configured PIN', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // non-empty configured PIN
            (configuredPin) => {
              expect(verifyPin('', configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for whitespace-only strings against any configured PIN', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // non-empty configured PIN
            fc
              .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 10 })
              .map((chars) => chars.join('')), // whitespace-only submitted PIN
            (configuredPin, whitespacePin) => {
              expect(verifyPin(whitespacePin, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for case-different PINs (case-sensitive comparison)', () => {
        fc.assert(
          fc.property(
            // Generate PINs containing at least one letter
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
            (configuredPin) => {
              // Flip the case of the PIN
              const caseDifferentPin = configuredPin
                .split('')
                .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
                .join('');

              // If flipping case resulted in the same string, skip
              if (caseDifferentPin === configuredPin) return;

              expect(verifyPin(caseDifferentPin, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });

      it('returns false for similar strings that are substrings of configured PIN', () => {
        fc.assert(
          fc.property(
            // Generate PINs with at least 2 characters
            fc.string({ minLength: 3 }).filter((s) => s.trim().length >= 3),
            (configuredPin) => {
              // Take a substring (first n-1 characters)
              const substring = configuredPin.slice(0, -1);
              expect(verifyPin(substring, configuredPin)).toBe(false);
            },
          ),
          { numRuns: 100 },
        );
      });
    });
  });
});
