import { CONFIG, getBoundFetch } from "@/modules/core";
import type {
  CurationApplication,
  CurationApplicationDecideInput,
  CurationApplicationVoteInput,
  CurationApplicationVoteResult,
  CurationApplicationList,
  CurationApplicationMine,
  CurationApplicationState,
  CurationApplicationWindow,
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
  CurationRecommenderStats,
  CurationRoster,
  CurationRosterAdminEntry,
  CurationRosterAdminList,
  CurationRosterFeedPage,
  CurationRosterFeedParams,
  CurationRosterSetInput,
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

/**
 * A light shape check per response family, not a schema validator: it answers
 * "is this the kind of body the consumers dereference", so a 200 that carries
 * something else (an error envelope, another route's body) fails here instead
 * of inside a query builder reading `.items.length`.
 */
type ShapeCheck = (data: unknown) => boolean;

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** Every paged family: the list is what the consumers page over. */
const hasItems: ShapeCheck = (data) => isRecord(data) && Array.isArray(data.items);
const hasCurators: ShapeCheck = (data) => isRecord(data) && Array.isArray(data.curators);
/** Route 5: the viewer finds their own recommendation by name in this list. */
const hasRecommenders: ShapeCheck = (data) => isRecord(data) && Array.isArray(data.recommenders);
/** `vp` is nullable, so the field has to be present rather than truthy. */
const isStatus: ShapeCheck = (data) => isRecord(data) && "vp" in data;
/**
 * A scorecard is counted, never absent: an unknown recommender answers zeros
 * rather than a 404, so a body without a numeric `recommended` is another
 * route's answer and not an empty scorecard.
 */
/** Every number the scorecard prints, the window it prints them for included. */
const SCORECARD_COUNTS = ["window_days", "recommended", "curated", "dismissed", "withdrawn", "precision"] as const;
const isRecommenderStats: ShapeCheck = (data) =>
  isRecord(data) &&
  SCORECARD_COUNTS.every((key) => typeof data[key] === "number") &&
  typeof data.trusted === "boolean";

async function parse<T>(response: Response, what: string, check?: ShapeCheck): Promise<T> {
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
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CurationApiError(`Unexpected response for ${what}`, response.status);
  }
  if (check && !check(data)) {
    throw new CurationApiError(`Unexpected response for ${what}`, response.status);
  }
  return data as T;
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

/** Hosts a credential may reach without TLS: a local gateway has no certificate. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The authed routes put the HiveSigner code in the body, so the transport is
 * the only thing keeping a replayable credential private. A relative host
 * (empty for same-origin, `//gateway`, `/api`) takes the page's own transport,
 * so it is resolved against the page before the scheme is read.
 */
function assertCredentialTransport(what: string) {
  const host = CONFIG.privateApiHost || "";
  const page = typeof window !== "undefined" ? window.location?.href : undefined;
  let parsed: URL;
  try {
    parsed = page ? new URL(host, page) : new URL(host);
  } catch {
    // Relative with no page to resolve against: outside a browser nothing can
    // be fetched from a relative URL either.
    return;
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) return;
  throw new CurationApiError(`Refusing to ${what} over an insecure connection`, 0);
}

async function getJson<T>(
  path: string,
  what: string,
  signal?: AbortSignal,
  check?: ShapeCheck
): Promise<T> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(url(path), { method: "GET", signal });
  return parse<T>(response, what, check);
}

async function postJson<T>(
  path: string,
  code: string | undefined,
  body: Record<string, unknown>,
  what: string,
  signal?: AbortSignal,
  check?: ShapeCheck
): Promise<T> {
  if (!code) {
    throw new Error("[SDK][Curation] missing auth");
  }
  assertCredentialTransport(what);
  const fetchApi = getBoundFetch();
  const response = await fetchApi(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, code }),
    // A 307 or 308 would resend this body, code included, to wherever the
    // redirect points.
    redirect: "error",
    signal,
  });
  return parse<T>(response, what, check);
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
    signal,
    hasItems
  );
}

export function fetchCurationStatus(signal?: AbortSignal): Promise<CurationStatus> {
  return getJson<CurationStatus>("/status", "fetch curation status", signal, isStatus);
}

export function fetchCurationRoster(signal?: AbortSignal): Promise<CurationRoster> {
  return getJson<CurationRoster>("/roster", "fetch curation roster", signal, hasCurators);
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
    signal,
    hasItems
  );
}

export function fetchCurationRecommenderStats(
  username: string,
  signal?: AbortSignal
): Promise<CurationRecommenderStats> {
  return getJson<CurationRecommenderStats>(
    `/recommender/${encodeURIComponent(username)}`,
    "fetch recommender stats",
    signal,
    isRecommenderStats
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
    signal,
    hasRecommenders
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
  return postJson<CurationRosterFeedPage>(
    "/roster-feed",
    code,
    body,
    "fetch roster feed",
    signal,
    hasItems
  );
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

/**
 * The roster admin routes. All three are admin-only upstream, and all three are
 * POSTs: the private view carries notes and retired rows, which must never enter
 * the edge-cached roster GET.
 */
export function curationRosterListRequest(
  code: string | undefined,
  signal?: AbortSignal
): Promise<CurationRosterAdminList> {
  // Same shape check as the public roster: a 200 carrying an error envelope, or any
  // body without `curators`, must reach the query's error path. Without it the panel
  // renders `data?.curators ?? []` and an outage looks like an empty roster.
  return postJson<CurationRosterAdminList>("/roster-list", code, {}, "list roster", signal, hasCurators);
}

export function curationRosterSetRequest(
  code: string | undefined,
  input: CurationRosterSetInput
): Promise<{ curator: CurationRosterAdminEntry }> {
  const { curator, role, rules, note, term_days } = input;
  if (!curator || !role) {
    throw new Error("[SDK][Curation] roster set needs a curator and a role");
  }
  const body: Record<string, unknown> = { curator, role };
  // Sent whole or not at all: the backend replaces the stored rules with what
  // arrives, so a partial object would silently drop the rules left out.
  if (rules) body.rules = rules;
  if (note !== undefined) body.note = note;
  // `!== undefined`, never a truthiness test: 0 is the one value that MEANS
  // something here, and it is the whole of "keep this seat".
  if (term_days !== undefined) body.term_days = term_days;
  return postJson<{ curator: CurationRosterAdminEntry }>("/roster-set", code, body, "set curator");
}

export function curationRosterRetireRequest(
  code: string | undefined,
  curator: string
): Promise<{ ok: boolean; curator: string }> {
  if (!curator) {
    throw new Error("[SDK][Curation] roster retire needs a curator");
  }
  return postJson<{ ok: boolean; curator: string }>(
    "/roster-retire",
    code,
    { curator },
    "retire curator"
  );
}

/**
 * Guest curator applications. Apply, mine and withdraw are open to any signed-in
 * account; the other three are admin-only upstream. All six are POSTs, so every
 * private field stays off the edge-cached GET tier.
 */
const hasApplication: ShapeCheck = (data) => isRecord(data) && "application" in data;
const hasApplications: ShapeCheck = (data) => isRecord(data) && Array.isArray(data.applications);
const hasWindow: ShapeCheck = (data) => isRecord(data) && isRecord(data.window);

export function curationApplicationApplyRequest(
  code: string | undefined,
  answers: { motivation: string; availability: string; pick: string }
): Promise<{ application: CurationApplication; window: CurationApplicationWindow }> {
  const motivation = answers.motivation?.trim();
  const availability = answers.availability?.trim();
  const pick = answers.pick?.trim();
  if (!motivation || !availability || !pick) {
    throw new Error("[SDK][Curation] an application needs all three answers");
  }
  return postJson("/application-apply", code, { motivation, availability, pick }, "apply", undefined, hasApplication);
}

export function curationApplicationMineRequest(
  code: string | undefined,
  signal?: AbortSignal
): Promise<CurationApplicationMine> {
  return postJson("/application-mine", code, {}, "read your application", signal, hasApplication);
}

export function curationApplicationWithdrawRequest(
  code: string | undefined
): Promise<{ application: CurationApplication }> {
  return postJson("/application-withdraw", code, {}, "withdraw your application", undefined, hasApplication);
}

export function curationApplicationListRequest(
  code: string | undefined,
  params: { state?: CurationApplicationState; limit?: number } = {},
  signal?: AbortSignal
): Promise<CurationApplicationList> {
  const body: Record<string, unknown> = {};
  if (params.state) body.state = params.state;
  if (params.limit) body.limit = params.limit;
  // Same reason the roster list checks its shape: without it a 200 carrying an
  // error envelope renders as an empty queue rather than reaching the error path.
  return postJson("/application-list", code, body, "list applications", signal, hasApplications);
}

export function curationApplicationDecideRequest(
  code: string | undefined,
  input: CurationApplicationDecideInput
): Promise<{ application: CurationApplication }> {
  const { applicant, state, role, note } = input;
  if (!applicant || !state) {
    throw new Error("[SDK][Curation] a decision needs an applicant and a state");
  }
  const body: Record<string, unknown> = { applicant, state };
  // The role belongs to an acceptance only. The desk ignores it on a decline
  // rather than refusing it, so sending one would be a lie in the audit log.
  if (state === "accepted" && role) body.role = role;
  if (note !== undefined) body.note = note;
  return postJson("/application-decide", code, body, "decide an application", undefined, hasApplication);
}

export function curationApplicationVoteRequest(
  code: string | undefined,
  input: CurationApplicationVoteInput
): Promise<CurationApplicationVoteResult> {
  const { applicant, vote, note } = input;
  if (!applicant || !vote) {
    throw new Error("[SDK][Curation] a vote needs an applicant and a value");
  }
  const body: Record<string, unknown> = { applicant, vote };
  if (note !== undefined) body.note = note;
  return postJson("/application-vote", code, body, "vote on an application", undefined, hasApplication);
}

export function curationApplicationWindowRequest(
  code: string | undefined,
  input: { open?: boolean; message?: string | null; quorum?: number; term_days?: number }
): Promise<{ window: CurationApplicationWindow; quorum: number; term_days: number }> {
  const body: Record<string, unknown> = {};
  // Every field is sent only when it is being CHANGED. Upstream reads an absent field as
  // "leave it", and one settings row holds all four: a save that carried the others would
  // put whatever this caller last read back over whatever changed since. `open` matters
  // most, because a stale one reopens applications to readers who act on it.
  if (input.open !== undefined) body.open = input.open;
  // A present null clears the message; absent leaves the stored one in place.
  if (input.message !== undefined) body.message = input.message;
  if (input.quorum !== undefined) body.quorum = input.quorum;
  if (input.term_days !== undefined) body.term_days = input.term_days;
  if (Object.keys(body).length === 0) {
    throw new Error("[SDK][Curation] a window save needs something to set");
  }
  return postJson("/application-window", code, body, "set the application window", undefined, hasWindow);
}

export function curationMarkRequest(
  code: string | undefined,
  input: CurationMarkInput
): Promise<CurationMarkResponse> {
  const { author, permlink, state, reason, note, snooze_until, lane } = input;
  if (!author || !permlink || !state) {
    throw new Error("[SDK][Curation] mark needs author, permlink and state");
  }
  const body: Record<string, unknown> = { author, permlink, state };
  if (reason) body.reason = reason;
  if (note) body.note = note;
  if (snooze_until) body.snooze_until = snooze_until;
  if (lane) body.lane = lane;
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
  return postJson<CurationMyMarksResponse>("/marks", code, body, "fetch my marks", signal, hasItems);
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
