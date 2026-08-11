import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AppError,
  ValidationError,
  NotFoundError,
  LlmError,
  RateLimitError,
  SessionNotFoundError,
  InvalidTokenError,
  SessionExpiredError,
  SessionCompletedError,
  SessionBusyError,
  LlmUnavailableError,
  MessageEmptyError,
  MessageTooLongError,
} from './errors';

describe('RateLimitError retryAfterSeconds', () => {
  it('stores retryAfterSeconds when provided', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), (message, seconds) => {
        const error = new RateLimitError(message, seconds);
        expect(error.retryAfterSeconds).toBe(seconds);
      }),
    );
  });

  it('has undefined retryAfterSeconds when omitted', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const error = new RateLimitError(message);
        expect(error.retryAfterSeconds).toBeUndefined();
      }),
    );
  });
});

/**
 * Property 3: Error class hierarchy consistency
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
describe('AppError hierarchy', () => {
  const errorClasses = [
    {
      Class: ValidationError,
      expectedStatusCode: 400,
      expectedCode: 'VALIDATION_ERROR',
      expectedName: 'ValidationError',
    },
    {
      Class: NotFoundError,
      expectedStatusCode: 404,
      expectedCode: 'NOT_FOUND',
      expectedName: 'NotFoundError',
    },
    {
      Class: LlmError,
      expectedStatusCode: 503,
      expectedCode: 'LLM_UNAVAILABLE',
      expectedName: 'LlmError',
    },
    {
      Class: RateLimitError,
      expectedStatusCode: 429,
      expectedCode: 'RATE_LIMITED',
      expectedName: 'RateLimitError',
    },
    {
      Class: SessionNotFoundError,
      expectedStatusCode: 404,
      expectedCode: 'SESSION_NOT_FOUND',
      expectedName: 'SessionNotFoundError',
    },
    {
      Class: InvalidTokenError,
      expectedStatusCode: 403,
      expectedCode: 'INVALID_TOKEN',
      expectedName: 'InvalidTokenError',
    },
    {
      Class: SessionExpiredError,
      expectedStatusCode: 409,
      expectedCode: 'SESSION_EXPIRED',
      expectedName: 'SessionExpiredError',
    },
    {
      Class: SessionCompletedError,
      expectedStatusCode: 409,
      expectedCode: 'SESSION_COMPLETED',
      expectedName: 'SessionCompletedError',
    },
    {
      Class: SessionBusyError,
      expectedStatusCode: 409,
      expectedCode: 'SESSION_BUSY',
      expectedName: 'SessionBusyError',
    },
    {
      Class: LlmUnavailableError,
      expectedStatusCode: 503,
      expectedCode: 'LLM_UNAVAILABLE',
      expectedName: 'LlmUnavailableError',
    },
    {
      Class: MessageEmptyError,
      expectedStatusCode: 400,
      expectedCode: 'MESSAGE_EMPTY',
      expectedName: 'MessageEmptyError',
    },
    {
      Class: MessageTooLongError,
      expectedStatusCode: 400,
      expectedCode: 'MESSAGE_TOO_LONG',
      expectedName: 'MessageTooLongError',
    },
  ] as const;

  for (const { Class, expectedStatusCode, expectedCode, expectedName } of errorClasses) {
    describe(expectedName, () => {
      it('produces correct statusCode for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error.statusCode).toBe(expectedStatusCode);
          }),
        );
      });

      it('produces correct code for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error.code).toBe(expectedCode);
          }),
        );
      });

      it('is instanceof AppError for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error).toBeInstanceOf(AppError);
          }),
        );
      });

      it('is instanceof Error for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error).toBeInstanceOf(Error);
          }),
        );
      });

      it('has name property matching class name for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error.name).toBe(expectedName);
          }),
        );
      });

      it('preserves the message for any message', () => {
        fc.assert(
          fc.property(fc.string(), (message) => {
            const error = new Class(message);
            expect(error.message).toBe(message);
          }),
        );
      });
    });
  }
});

describe('Default messages for screening error classes', () => {
  const defaultMessageClasses = [
    { Class: SessionNotFoundError, expectedMessage: 'Session not found' },
    { Class: InvalidTokenError, expectedMessage: 'Invalid or missing token' },
    { Class: SessionExpiredError, expectedMessage: 'Session has expired' },
    { Class: SessionCompletedError, expectedMessage: 'Session is already completed' },
    { Class: SessionBusyError, expectedMessage: 'Session is currently processing another request' },
    { Class: LlmUnavailableError, expectedMessage: 'LLM provider is unavailable' },
    { Class: MessageEmptyError, expectedMessage: 'Message is empty or whitespace-only' },
    { Class: MessageTooLongError, expectedMessage: 'Message exceeds maximum length' },
  ] as const;

  for (const { Class, expectedMessage } of defaultMessageClasses) {
    it(`${Class.name} uses default message when none provided`, () => {
      const error = new Class();
      expect(error.message).toBe(expectedMessage);
    });
  }
});
