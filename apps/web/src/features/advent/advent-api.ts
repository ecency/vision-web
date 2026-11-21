import type { DoorResult, GrandDraw, OpenedDoor, SeasonState } from "./types";

// A typed client for games-api's /v1/advent routes. The page signs in with the
// game session Raidstead already uses; the server decides everything else.

export class AdventError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AdventError";
  }
}

export interface AdventApiOptions {
  base: string;
  /// The game session token, if any.
  token: () => string | null;
  fetch?: typeof fetch;
}

export function createAdventApi(opts: AdventApiOptions) {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = auth ? opts.token() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await f(opts.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new AdventError(0, "offline", "Could not reach the server.");
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new AdventError(
        res.status,
        typeof json.error === "string" ? json.error : "error",
        typeof json.message === "string" ? json.message : res.statusText
      );
    }
    return json as T;
  }
  const door = (season: number, day: number) => `/v1/advent/${season}/doors/${day}`;
  return {
    season: (season: number) => call<SeasonState>("GET", `/v1/advent/${season}`),
    open: (season: number, day: number) => call<OpenedDoor>("POST", `${door(season, day)}/open`),
    answer: (season: number, day: number, body: { answer: string } | { choice: number }) =>
      call<{ ok: true; late: boolean }>("POST", `${door(season, day)}/answer`, body),
    wave: (season: number, day: number, permlink: string) =>
      call<{ ok: true }>("POST", `${door(season, day)}/wave`, { permlink }),
    // public and cached for a minute: never sent with a session
    result: (season: number, day: number) => call<DoorResult>("GET", `${door(season, day)}/result`, undefined, false),
    // public; 404 no_grand when the season has none
    grand: (season: number) => call<GrandDraw>("GET", `/v1/advent/${season}/grand`, undefined, false),
    reminders: (enabled: boolean) => call<{ ok: true; enabled: boolean }>("PUT", "/v1/advent/reminders", { enabled })
  };
}
export type AdventApi = ReturnType<typeof createAdventApi>;
