import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorHandler, GENERIC_ERROR_MESSAGE } from './error-handler';
import { ApiError } from '../errors';

/**
 * The handler used to answer `err.message` with a 500, so whatever a library threw was echoed
 * to the caller. A pg error carries the table, the column and the constraint it failed on, and
 * its detail can quote parameter values.
 */
function appThatThrows(error: unknown) {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/boom', () => {
    throw error;
  });
  return app;
}

let errorLog: ReturnType<typeof vi.spyOn>;
let warnLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler', () => {
  it('does not leak a driver error to the caller, and logs it in full', async () => {
    const pgError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "tenants_custom_domain_key"'
      ),
      {
        code: '23505',
        table: 'tenants',
        column: 'custom_domain',
        constraint: 'tenants_custom_domain_key',
        detail: 'Key (custom_domain)=(example.test) already exists.',
      }
    );

    const res = await appThatThrows(pgError).request('http://localhost/boom');
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).toBe(GENERIC_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('tenants_custom_domain_key');
    expect(JSON.stringify(body)).not.toContain('custom_domain');
    // The operator still gets everything: the error object itself is logged.
    expect(errorLog).toHaveBeenCalled();
    expect(errorLog.mock.calls[0]).toContain(pgError);
  });

  it('keeps a message a route deliberately surfaced, with its status', async () => {
    const res = await appThatThrows(
      new ApiError(400, 'Invalid configuration document')
    ).request('http://localhost/boom');
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid configuration document');
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalled();
  });

  it('answers a framework error with its own status rather than 500', async () => {
    const res = await appThatThrows(
      new HTTPException(413, { message: 'Payload too large' })
    ).request('http://localhost/boom');

    expect(res.status).toBe(413);
  });

  it('does not echo an unexpected error message even when it looks harmless', async () => {
    const res = await appThatThrows(new Error('connect ECONNREFUSED 10.0.0.5:5432')).request(
      'http://localhost/boom'
    );
    const body = (await res.json()) as { error: string };

    expect(body.error).toBe(GENERIC_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
