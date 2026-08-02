/**
 * Errors that are safe to show a caller.
 *
 * Everything else that escapes a route is treated as an internal failure and answered with a
 * fixed message (see middleware/error-handler), because the alternative is echoing whatever a
 * library threw: a Postgres driver error carries table, column and constraint names, and
 * sometimes parameter values. A route that wants the caller to see a specific message and
 * status throws this instead, the same way DomainInUseError lets one path answer with 409.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
