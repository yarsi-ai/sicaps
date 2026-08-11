export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, 'FORBIDDEN');
  }
}

export class LlmError extends AppError {
  constructor(message: string) {
    super(message, 503, 'LLM_UNAVAILABLE');
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message, 429, 'RATE_LIMITED');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SessionNotFoundError extends AppError {
  constructor(message = 'Session not found') {
    super(message, 404, 'SESSION_NOT_FOUND');
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or missing token') {
    super(message, 403, 'INVALID_TOKEN');
  }
}

export class SessionExpiredError extends AppError {
  constructor(message = 'Session has expired') {
    super(message, 409, 'SESSION_EXPIRED');
  }
}

export class SessionCompletedError extends AppError {
  constructor(message = 'Session is already completed') {
    super(message, 409, 'SESSION_COMPLETED');
  }
}

export class SessionBusyError extends AppError {
  constructor(message = 'Session is currently processing another request') {
    super(message, 409, 'SESSION_BUSY');
  }
}

export class LlmUnavailableError extends AppError {
  constructor(message = 'LLM provider is unavailable') {
    super(message, 503, 'LLM_UNAVAILABLE');
  }
}

export class MessageEmptyError extends AppError {
  constructor(message = 'Message is empty or whitespace-only') {
    super(message, 400, 'MESSAGE_EMPTY');
  }
}

export class MessageTooLongError extends AppError {
  constructor(message = 'Message exceeds maximum length') {
    super(message, 400, 'MESSAGE_TOO_LONG');
  }
}

export class InvalidPinError extends AppError {
  constructor(message = 'Incorrect PIN') {
    super(message, 401, 'INVALID_PIN');
  }
}
