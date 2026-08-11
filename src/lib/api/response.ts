export interface ApiResponse<T> {
  data: T | null;
  error: { code: string; message: string; details: unknown[] | null } | null;
  meta: { timestamp: string; requestId: string };
}

export function successResponse<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? crypto.randomUUID(),
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown[],
  requestId?: string,
): ApiResponse<never> {
  return {
    data: null,
    error: { code, message, details: details ?? null },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? crypto.randomUUID(),
    },
  };
}
