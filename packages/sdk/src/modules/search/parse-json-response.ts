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
    try {
      return await response.json();
    } catch {
      try {
        return await response.text();
      } catch {
        return undefined;
      }
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
