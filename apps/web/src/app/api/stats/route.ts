import { NextRequest, NextResponse } from "next/server";
import { EcencyConfigManager } from "@/config";
import { safeDecodeURIComponent } from "@/utils";

// Escape regex metacharacters so a page path is matched literally — an author like
// `peak.snaps` must not let `.` match an arbitrary character.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Bounded, best-effort in-memory response cache -------------------------------------
// This is an UNAUTHENTICATED endpoint, so without it a caller can deliberately repeat the
// same expensive Plausible scan for a post at will (a post-lifetime range legitimately
// covers all recorded data, so the span cap below cannot prevent that). The cache collapses
// repeated identical queries to one upstream scan per TTL, and the in-flight map coalesces a
// *concurrent* burst of identical queries into a single scan. Both are per-process
// (best-effort): across replicas the durable control is a shared cache / edge rate limiter,
// which lives in infra, not this repo. Stats are view counts, so minutes of staleness are fine.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const statsCache = new Map<string, { expires: number; status: number; body: unknown }>();

// While one upstream scan is in flight, later identical requests await the same promise
// instead of starting their own scan (prevents a cache stampede on a cold/expired key).
const inflightStats = new Map<string, Promise<{ status: number; body: unknown }>>();

function getCachedStats(key: string) {
  const hit = statsCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    statsCache.delete(key);
    return undefined;
  }
  // LRU: a hit becomes most-recently-used (Map preserves insertion order).
  statsCache.delete(key);
  statsCache.set(key, hit);
  return hit;
}

function setCachedStats(key: string, status: number, body: unknown) {
  // Refresh position if present, then evict the least-recently-used (first) at capacity.
  statsCache.delete(key);
  if (statsCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = statsCache.keys().next().value;
    if (oldest !== undefined) {
      statsCache.delete(oldest);
    }
  }
  statsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, status, body });
}

// Strict YYYY-MM-DD calendar validity. The client only ever sends plain dates, so accept
// nothing else — a time component would be a second representation of the same day and a
// trivial cache-key bypass. Also rejects impossible dates (e.g. 2023-02-30, which Date.parse
// would silently normalize to 2023-03-02) by round-tripping Y/M/D through a UTC Date.
// Returns the UTC-midnight timestamp, or null.
function parseStrictIsoDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ts = Date.UTC(year, month - 1, day);
  const dt = new Date(ts);
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    return null;
  }
  return ts;
}

// Allow-listed metrics/dimensions. A legitimate entry-stats query sends a small, unique set:
// 1..4 metrics and 0 or 1 dimension. Rejecting duplicates and capping lengths keeps the
// cache-key space small so it can't be inflated to evict/bypass the cache.
const ALLOWED_METRICS = ["visitors", "visits", "pageviews", "visit_duration"];
const ALLOWED_DIMENSIONS = ["visit:source", "visit:device", "visit:country_name"];
const MAX_METRICS = ALLOWED_METRICS.length;
const MAX_DIMENSIONS = 1;

function isAllowedList(value: unknown, allowed: string[], minLen: number, maxLen: number): boolean {
  if (!Array.isArray(value) || value.length < minLen || value.length > maxLen) {
    return false;
  }
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !allowed.includes(v) || seen.has(v)) {
      return false;
    }
    seen.add(v);
  }
  return true;
}

// Perform the upstream Plausible query, caching a successful result. Errors return a non-200
// status and are NOT cached (so they are retried, not memoized).
async function queryPlausibleStats(
  cacheKey: string,
  requestBody: string,
  statsHost: string | undefined,
  apiKey: string | undefined
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${statsHost}/api/v2/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: requestBody,
      cache: "default",
      // Plausible's /api/v2/query has historically blocked on its DB pool
      // (DBConnection.ConnectionError); a hung fetch here would pile up Node
      // connection slots the same way /pl/api/event used to. Bound it.
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return { status: isTimeout ? 504 : 502, body: {} };
  }

  try {
    const body = await response.json();
    // Forward Plausible's status instead of always returning 200, so the SDK's response.ok
    // guard fires on upstream errors (invalid range, unknown dimension) instead of silently
    // rendering 0.
    const status = response.ok ? 200 : response.status;
    if (response.ok) {
      setCachedStats(cacheKey, status, body);
    }
    return { status, body };
  } catch (e) {
    // The AbortSignal that bounds the fetch also bounds the body read, so response.json()
    // can throw TimeoutError/AbortError; classify those as 504, anything else as 502.
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { status: 504, body: {} };
    }
    return { status: 502, body: {} };
  }
}

export async function POST(request: NextRequest) {
  const isEnabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.enabled
  );
  if (!isEnabled) {
    return Response.json({ status: 404 });
  }

  // A body that is not a JSON object is the caller's error: answer 400 instead of letting the
  // parse (or the destructure of `null`) throw into an unhandled 500.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    url,
    date_range: dateRange = "12mo",
    metrics,
    dimensions,
    filterBy = "event:page"
  } = payload as Record<string, any>;

  if (!url) {
    return Response.json({ status: 400 });
  }

  // This is an UNAUTHENTICATED public proxy for a single post's view stats, using the
  // server's Plausible API key. Every caller-controlled field is constrained to the exact
  // shape entry-stats sends, so a caller can't aggregate site-wide analytics (url "/"), pull
  // arbitrary dimensions, run all-time scans, or inflate the cache-key space. Profile-level
  // aggregation has its own auth-gated route (/api/profile-insights).

  // Metrics: 1..4 unique allow-listed values. Dimensions: 0 or 1 unique allow-listed value.
  if (!isAllowedList(metrics, ALLOWED_METRICS, 1, MAX_METRICS)) {
    return NextResponse.json({ error: "invalid metrics" }, { status: 400 });
  }
  if (dimensions != null && !isAllowedList(dimensions, ALLOWED_DIMENSIONS, 0, MAX_DIMENSIONS)) {
    return NextResponse.json({ error: "invalid dimensions" }, { status: 400 });
  }

  // date_range: a bounded [from, to] YYYY-MM-DD tuple (what entry-stats sends) or a bounded
  // keyword. "all" is deliberately NOT allowed and the default is bounded, so an omitted
  // range can't trigger a full-history scan. Tuples must be two ordered, strictly-valid
  // calendar dates within a generous span cap. NOTE: the cap can't stop a deliberate wide
  // scan (a post-lifetime range covers all data) — the response cache + in-flight coalescing
  // are what bound repeated/concurrent expensive scans, with the edge limiter capping rate.
  const ALLOWED_RANGE_KEYWORDS = new Set(["day", "7d", "30d", "month", "6mo", "12mo"]);
  const MAX_RANGE_MS = 366 * 20 * 24 * 60 * 60 * 1000; // ~20 years
  let validRange = false;
  if (typeof dateRange === "string") {
    validRange = ALLOWED_RANGE_KEYWORDS.has(dateRange);
  } else if (Array.isArray(dateRange) && dateRange.length === 2) {
    const from = parseStrictIsoDate(dateRange[0]);
    const to = parseStrictIsoDate(dateRange[1]);
    validRange = from !== null && to !== null && from <= to && to - from <= MAX_RANGE_MS;
  }
  if (!validRange) {
    return NextResponse.json({ error: "invalid date_range" }, { status: 400 });
  }

  // Restrict the filter dimension to a known allow-list — `event:page` (viewed the page
  // anywhere in the visit) or `visit:entry_page` (landed on it).
  const filterDimension = ["event:page", "visit:entry_page"].includes(filterBy)
    ? filterBy
    : "event:page";

  // Plausible stores the pathname only, so strip any query string / fragment (e.g.
  // a comment permalink's `#@author/permlink`) before matching what's recorded.
  const page = safeDecodeURIComponent(url).split(/[?#]/)[0];

  // Only ever match a single exact post page. Every recorded shape (`/@author/permlink`,
  // `/hive-123/@author/permlink`, `/tag/@author/permlink`) ENDS in `/@author/permlink`, so
  // require that tail and anchor it (`$`), which also stops `/@a/p` matching `/@a/p-2`. This
  // rejects a bare `/`, a section prefix (`/trending/`) and a profile prefix (`/@user`) — all
  // of which would otherwise become a broad substring match aggregating stats without auth.
  if (!/\/@[a-z0-9.-]+\/[^/]+$/i.test(page)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pageFilter = ["matches", filterDimension, [`${escapeRegExp(page)}$`]];

  // Cache key = everything that determines the upstream result.
  const cacheKey = JSON.stringify({
    page,
    filterDimension,
    metrics,
    dimensions: dimensions ?? null,
    dateRange
  });

  const cached = getCachedStats(cacheKey);
  if (cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  const statsHost = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.host
  );
  const apiKey = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.apiKey
  );
  const siteId = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.plausible.siteId
  );
  const requestBody = JSON.stringify({
    site_id: siteId,
    metrics,
    filters: [pageFilter],
    dimensions,
    date_range: dateRange
  });

  // Coalesce concurrent identical queries into a single upstream scan.
  let pending = inflightStats.get(cacheKey);
  if (!pending) {
    pending = queryPlausibleStats(cacheKey, requestBody, statsHost, apiKey).finally(() => {
      inflightStats.delete(cacheKey);
    });
    inflightStats.set(cacheKey, pending);
  }

  const { status, body } = await pending;
  return NextResponse.json(body, { status });
}
