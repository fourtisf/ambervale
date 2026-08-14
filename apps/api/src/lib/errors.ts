/**
 * Typed API errors.
 *
 * Every rule the server enforces rejects through one of these, so the client
 * can branch on a stable `code` instead of parsing prose. `details` carries the
 * machine-readable extras a rejection needs — remainingMs on an early harvest,
 * have/need on a short delivery.
 */

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'PLOT_OCCUPIED'
  | 'PLOT_EMPTY'
  | 'PLOT_LOCKED'
  | 'NOT_READY'
  | 'NO_SEEDS'
  | 'LEVEL_TOO_LOW'
  | 'INSUFFICIENT_COINS'
  | 'INSUFFICIENT_ITEMS'
  | 'NODE_DEPLETED'
  | 'TOO_FAST'
  | 'RATE_LIMITED'
  | 'SLOT_LOCKED'
  | 'SLOT_NOT_OPEN'
  | 'ALREADY_EXPANDED'
  | 'CLAIMS_DISABLED'
  | 'WALLET_TAKEN'
  | 'CONFLICT';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Sign in required.') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message);

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

/** 409: the request was well-formed but the world said no. */
export const conflict = (code: ApiErrorCode, message: string, details?: Record<string, unknown>) =>
  new ApiError(409, code, message, details);

export const rateLimited = (message = 'Slow down.') => new ApiError(429, 'RATE_LIMITED', message);
