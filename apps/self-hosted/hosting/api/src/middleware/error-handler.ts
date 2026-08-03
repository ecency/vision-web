/**
 * Central error handler.
 *
 * The previous handler returned `err.message` verbatim with a 500, so anything an underlying
 * library threw reached the caller. A pg error names the table, the column and the constraint
 * it failed on, and its `detail` can quote the parameter values, which is a description of the
 * schema handed to whoever sent the request.
 *
 * Two things must survive that, so this maps rather than flattens:
 *   - a route that has something useful to say throws ApiError(status, message) and that
 *     message is returned as-is, which is how validation and ownership feedback the owner
 *     needs stays readable (zod-validator answers its own 400s before reaching here);
 *   - Hono's own HTTPException already carries a status and a framework-authored message
 *     (malformed JSON, payload limits), so its response is used unchanged.
 *
 * Anything else is logged in full server-side and answered with a fixed body.
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError } from '../errors';

export const GENERIC_ERROR_MESSAGE = 'Internal server error';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    // Framework-generated (bad JSON body, request too large). Status and message are ours.
    console.warn(`[API] ${c.req.method} ${c.req.path} -> ${err.status}: ${err.message}`);
    return err.getResponse();
  }

  if (err instanceof ApiError) {
    // Deliberately surfaced by a route. Logged at warn so a spike in client errors is still
    // visible, without the stack of an internal failure.
    console.warn(`[API] ${c.req.method} ${c.req.path} -> ${err.status}: ${err.message}`);
    return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  }

  // Unknown failure: the full error (message, stack, and any driver fields) goes to the log,
  // never to the response.
  console.error(`[API] Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: GENERIC_ERROR_MESSAGE }, 500);
}
