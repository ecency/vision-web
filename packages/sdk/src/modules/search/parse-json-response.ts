export type RequestError = Error & { status?: number; data?: unknown };

/**
 * Reads a response body and, when the status is not OK, throws an error that
 * keeps both the status and the parsed body.
 *
 * The search backend answers a malformed query with an explanation the user can
 * act on ("Maximum 5 tags!", "Query string too long! ...", "Parsed query is
 * empty!"). Dropping the body leaves callers with a bare status: they can
 * neither tell the user what to change nor tell a deterministic rejection from
 * a transient failure worth retrying.
 *
 * Module-internal on purpose - it is not part of the published SDK surface.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const parseBody = async (): Promise<unknown> => {
    // Read the body ONCE. Calling json() and then falling back to text() on the
    // same response cannot work: json() consumes the stream, so the fallback
    // always threw and the raw body of a non-JSON failure (an HTML error page
    // from a proxy) was silently lost.
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      return undefined;
    }

    if (raw === "") {
      return undefined;
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      // Raw text is a diagnostic, not a payload. On a failed response it is
      // what the caller shows or logs, but on a 2xx returning it would hand
      // back a string typed as the parsed body: callers reading `.results`
      // would see undefined and report an empty result set, and the
      // controversial/rising pager would throw on `resp.results.length`. An
      // unparseable success is a failure, so let it fall through to the throw
      // below rather than caching a string as a SearchResponse.
      return response.ok ? undefined : raw;
    }
  };

  const data = await parseBody();
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`) as RequestError;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  if (data === undefined) {
    throw new Error("Response body was empty or invalid JSON");
  }

  return data as T;
}
