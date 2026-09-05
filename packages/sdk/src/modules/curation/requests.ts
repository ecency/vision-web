import { CONFIG, getBoundFetch } from "@/modules/core";
import type {
  CurationCursorInput,
  CurationCursorResponse,
  CurationDismissRecoInput,
  CurationDismissRecoResponse,
  CurationFeedPage,
  CurationFeedParams,
  CurationMarkClearResponse,
  CurationMarkInput,
  CurationMarkResponse,
  CurationMyMarksParams,
  CurationMyMarksResponse,
  CurationPost,
  CurationRecommendMetaInput,
  CurationRecommendationsPage,
  CurationRecommendationsParams,
  CurationRoster,
  CurationRosterFeedPage,
  CurationRosterFeedParams,
  CurationStatus,
  CurationTickRequest,
  CurationTickResponse,
} from "./types";

/**
 * Curation desk transport. Public GETs carry no identity; authed POSTs take the
 * HiveSigner access `code` as an explicit argument and send it in the body.
 * Token freshness is the caller's job (web: ensureValidToken; mobile: its token
 * wrapper), so a builder never captures a code that can expire.
 */

const ROUTE = "/private-api/curation-desk";

export class CurationApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "CurationApiError";
    this.status = status;
    this.data = data;
  }
}

async function parse<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    let data: unknown = undefined;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    throw new CurationApiError(`Failed to ${what}: ${response.status}`, response.status, data);
  }
  // The gateway answers an unknown GET with a 200 HTML page. That is never an
  // empty queue, so a non-JSON body is an error too. A body that only claims
  // to be JSON gets the same treatment: parsing it must not reach the caller
  // as a SyntaxError with no status on it.
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType && !contentType.includes("json")) {
    throw new CurationApiError(`Unexpected response for ${what}`, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new CurationApiError(`Unexpected response for ${what}`, response.status);
  }
}

const COMMUNITY_RE = /^hive-\d{5,6}$/;
const SEED_RE = /^[a-z0-9]{8,16}$/;

/**
 * Booleans the desk already defaults to true, so only an explicit false says
 * anything. Sending the "1" would split memo and cache keys against a gateway
 * that drops it.
 */
const DEFAULT_TRUE = new Set(["hide_curated", "hide_reviewed", "hide_snoozed"]);

/** Fixed emission order: keeps memo and shared-cache keys stable across clients. */
const PARAM_ORDER = [
  "sort",
  "seed",
  "view",
  "app",
  "community",
  "window",
  "rep_min",
  "rep_max",
  "min_words",
  "max_words",
  "has_images",
  "new_authors",
  "recommended",
  "flagged",
  "hide_curated",
  "hide_reviewed",
  "hide_snoozed",
  "limit",
] as const;

export type NormalizedCurationParams = Record<string, string>;

/**
 * Drops defaults and unknown values, emits fixed-order string params. Used for
 * the query string, the roster body and the React Query key, so all three agree.
 */
export function normalizeCurationParams(
  params: CurationRosterFeedParams | CurationFeedParams = {}
): NormalizedCurationParams {
  const source = params as Record<string, unknown>;
  const out: NormalizedCurationParams = {};
  for (const name of PARAM_ORDER) {
    const value = source[name];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      if (DEFAULT_TRUE.has(name)) {
        if (!value) out[name] = "0";
      } else if (value) {
        out[name] = "1";
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      out[name] = String(Math.trunc(value));
      continue;
    }
    const text = String(value);
    if ((name === "app" || name === "window") && text === "all") continue;
    if (name === "community" && !COMMUNITY_RE.test(text)) continue;
    if (name === "seed" && !SEED_RE.test(text)) continue;
    out[name] = text;
  }
  // The seed only means something for the random order.
  if (out.sort !== "random") delete out.seed;
  return out;
}

function toQuery(normalized: NormalizedCurationParams, cursor?: string): string {
  const search = new URLSearchParams();
  for (const name of PARAM_ORDER) {
    if (normalized[name] !== undefined) search.set(name, normalized[name]);
  }
  if (cursor) search.set("cursor", cursor);
  const text = search.toString();
  return text ? `?${text}` : "";
}

function url(path: string): string {
  return `${CONFIG.privateApiHost}${ROUTE}${path}`;
}

async function getJson<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(url(path), { method: "GET", signal });
  return parse<T>(response, what);
}

async function postJson<T>(
  path: string,
  code: string | undefined,
  body: Record<string, unknown>,
  what: string,
  signal?: AbortSignal
): Promise<T> {
  if (!code) {
    throw new Error("[SDK][Curation] missing auth");
  }
  const fetchApi = getBoundFetch();
  const response = await fetchApi(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, code }),
    signal,
  });
  return parse<T>(response, what);
}

// ---------------------------------------------------------------------------
// Public reads (used by the query builders)
// ---------------------------------------------------------------------------

export function fetchCurationFeedPage(
  params: CurationFeedParams,
  cursor?: string,
  signal?: AbortSignal
): Promise<CurationFeedPage> {
  return getJson<CurationFeedPage>(
    `/feed${toQuery(normalizeCurationParams(params), cursor)}`,
    "fetch curation feed",
    signal
  );
}

export function fetchCurationStatus(signal?: AbortSignal): Promise<CurationStatus> {
  return getJson<CurationStatus>("/status", "fetch curation status", signal);
}

export function fetchCurationRoster(signal?: AbortSignal): Promise<CurationRoster> {
  return getJson<CurationRoster>("/roster", "fetch curation roster", signal);
}

export function fetchCurationRecommendationsPage(
  params: CurationRecommendationsParams,
  cursor?: string,
  signal?: AbortSignal
): Promise<CurationRecommendationsPage> {
  const search = new URLSearchParams();
  if (params.sort) search.set("sort", params.sort);
  if (params.limit) search.set("limit", String(params.limit));
  if (cursor) search.set("cursor", cursor);
  const text = search.toString();
  return getJson<CurationRecommendationsPage>(
    `/recommendations${text ? `?${text}` : ""}`,
    "fetch curation recommendations",
    signal
  );
}

export function fetchCurationPost(
  author: string,
  permlink: string,
  signal?: AbortSignal
): Promise<CurationPost> {
  return getJson<CurationPost>(
    `/post/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`,
    "fetch curation post",
    signal
  );
}

// ---------------------------------------------------------------------------
// Authed writes and reads (code in the body)
// ---------------------------------------------------------------------------

export function curationRosterFeedRequest(
  code: string | undefined,
  params: CurationRosterFeedParams,
  cursor?: string,
  signal?: AbortSignal
): Promise<CurationRosterFeedPage> {
  const body: Record<string, unknown> = { ...normalizeCurationParams(params) };
  if (cursor) body.cursor = cursor;
  return postJson<CurationRosterFeedPage>("/roster-feed", code, body, "fetch roster feed", signal);
}

export function curationTickRequest(
  code: string | undefined,
  body: CurationTickRequest,
  signal?: AbortSignal
): Promise<CurationTickResponse> {
  return postJson<CurationTickResponse>(
    "/tick",
    code,
    {
      since: body.since,
      need: body.need.slice(0, 100),
      visible: body.visible.slice(0, 100),
    },
    "tick",
    signal
  );
}

export function curationMarkRequest(
  code: string | undefined,
  input: CurationMarkInput
): Promise<CurationMarkResponse> {
  const { author, permlink, state, reason, note, snooze_until } = input;
  if (!author || !permlink || !state) {
    throw new Error("[SDK][Curation] mark needs author, permlink and state");
  }
  const body: Record<string, unknown> = { author, permlink, state };
  if (reason) body.reason = reason;
  if (note) body.note = note;
  if (snooze_until) body.snooze_until = snooze_until;
  return postJson<CurationMarkResponse>("/mark", code, body, "set mark");
}

export function curationMarkClearRequest(
  code: string | undefined,
  input: { author: string; permlink: string }
): Promise<CurationMarkClearResponse> {
  if (!input.author || !input.permlink) {
    throw new Error("[SDK][Curation] mark-clear needs author and permlink");
  }
  return postJson<CurationMarkClearResponse>(
    "/mark-clear",
    code,
    { author: input.author, permlink: input.permlink },
    "clear mark"
  );
}

export function curationMyMarksRequest(
  code: string | undefined,
  params: CurationMyMarksParams = {},
  signal?: AbortSignal
): Promise<CurationMyMarksResponse> {
  const body: Record<string, unknown> = {};
  if (params.state) body.state = params.state;
  if (params.cursor) body.cursor = params.cursor;
  if (params.limit) body.limit = params.limit;
  return postJson<CurationMyMarksResponse>("/marks", code, body, "fetch my marks", signal);
}

export function curationCursorRequest(
  code: string | undefined,
  input: CurationCursorInput
): Promise<CurationCursorResponse> {
  if (!Number.isFinite(input.post_id) || !input.action) {
    throw new Error("[SDK][Curation] cursor needs post_id and action");
  }
  const body: Record<string, unknown> = { post_id: input.post_id, action: input.action };
  if (input.reason) body.reason = input.reason;
  return postJson<CurationCursorResponse>("/cursor", code, body, "move cursor");
}

const TRX_ID_RE = /^[0-9a-f]{40}$/;

export function curationRecommendMetaRequest(
  code: string | undefined,
  input: CurationRecommendMetaInput
): Promise<{ ok: boolean }> {
  const { author, permlink, trx_id, ua_class } = input;
  if (!author || !permlink || !ua_class) {
    throw new Error("[SDK][Curation] recommend-meta needs author, permlink and ua_class");
  }
  const body: Record<string, unknown> = { author, permlink, ua_class };
  // Optional and informational: only a well-formed id travels, so a path that
  // returned an odd shape never turns the ping into a 400.
  if (typeof trx_id === "string" && TRX_ID_RE.test(trx_id)) body.trx_id = trx_id;
  return postJson<{ ok: boolean }>("/recommend-meta", code, body, "send recommendation meta");
}

export function curationDismissRecoRequest(
  code: string | undefined,
  input: CurationDismissRecoInput
): Promise<CurationDismissRecoResponse> {
  if (!input.author || !input.permlink || !input.action) {
    throw new Error("[SDK][Curation] recommendation-dismiss needs author, permlink and action");
  }
  return postJson<CurationDismissRecoResponse>(
    "/recommendation-dismiss",
    code,
    { author: input.author, permlink: input.permlink, action: input.action },
    "dismiss recommendation"
  );
}
