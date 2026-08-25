/**
 * Error types for the newsletter client, in their own dependency-free file so
 * test setups can hand out the REAL classes (instanceof must hold across the
 * app) without pulling the SDK config chain along.
 */
export class NewsletterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

/** A refused send, carrying the relay's routing `code` (already_sent, suspended, ...). */
export class NewsletterSendRefusedError extends NewsletterApiError {
  constructor(
    message: string,
    status: number,
    public readonly code?: string,
    public readonly taken?: Array<{ cadence: string; period: string; kind: string }>,
    data?: unknown,
  ) {
    super(message, status, data);
  }
}
