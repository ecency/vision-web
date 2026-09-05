import { vi } from "vitest";
import type {
  CurationFeedPage,
  CurationPost,
  CurationRosterFeedPage,
  CurationRosterRow,
  CurationStatus,
} from "@ecency/sdk";
import { buildQueueDisplay } from "@/features/curation-desk/curation-queue-display";

export const NOW = Date.parse("2026-09-05T12:00:00Z");

export function iso(msOffset: number, base = NOW): string {
  return new Date(base + msOffset).toISOString();
}

let nextId = 1000;

export function makeRow(overrides: Partial<CurationRosterRow> = {}): CurationRosterRow {
  const post_id = overrides.post_id ?? nextId++;
  return {
    post_id,
    author: `author${post_id}`,
    permlink: `post-${post_id}`,
    title: `Post ${post_id}`,
    created: iso(-30 * 60_000),
    app: "ecency/3.0.0-vision",
    is_ecency: true,
    community: "hive-125125",
    community_title: "Photography Lovers",
    tags: ["photography"],
    rep: 62,
    is_new_author: false,
    author_post_count: 412,
    author_created: iso(-3 * 365 * 86_400_000),
    word_count: 812,
    image_count: 6,
    first_image: "https://images.ecency.com/p/example.png",
    summary: "summary",
    edited_at: null,
    edit_count: 0,
    votes: 14,
    pending_payout: 1.42,
    payout_at: iso(7 * 86_400_000 - 30 * 60_000),
    state: 0,
    trailed_by: null,
    voted_by: [],
    author_trailed_at: null,
    recommend_count: 0,
    unique_recommenders: 0,
    reco_no_meta_count: 0,
    _cursor: `c${post_id}`,
    overlay: null,
    ...overrides,
  };
}

export function makeOverlay(overrides: Partial<NonNullable<CurationRosterRow["overlay"]>> = {}) {
  return {
    signals: null,
    flags: {},
    excluded_reason: null,
    team_mark: null,
    team_mark_by: null,
    resurfaced_at: null,
    marks: [],
    notes_count: 0,
    ...overrides,
  };
}

/**
 * The window props the list hands a row. They come from the display builder in
 * production, so a spec that renders a row alone takes them from there too
 * rather than hand-computing what the row is supposed to receive.
 */
export function rowWindowProps(row: CurationRosterRow, now = Date.now()) {
  const display = buildQueueDisplay({
    rows: [row],
    teamCursor: null,
    sort: "newest",
    now,
    window: "all",
    expanded: { half: true, eighth: true, olderReviewed: true },
  });
  const item = display.items.find((i) => i.type === "row");
  if (!item || item.type !== "row") throw new Error("the display builder dropped the row");
  return {
    windowKind: item.windowKind,
    locked: item.locked,
    voteHidden: item.voteHidden,
    scalePct: item.scalePct,
  };
}

export function makeFeedPage(items: CurationRosterRow[], overrides: Partial<CurationFeedPage> = {}): CurationFeedPage {
  return {
    items,
    next_cursor: items.length ? items[items.length - 1]._cursor ?? null : null,
    team_cursor: { post_id: null, created: null },
    head_lag_seconds: 4,
    feed_version: "v1",
    generated_at: iso(0),
    ...overrides,
  };
}

export function makeRosterPage(items: CurationRosterRow[], overrides: Partial<CurationRosterFeedPage> = {}): CurationRosterFeedPage {
  return {
    items,
    next_cursor: items.length ? items[items.length - 1]._cursor ?? null : null,
    team_cursor: { post_id: null, created: null, set_by: "seckorama", set_at: iso(-18 * 60_000) },
    active_curators: [],
    facets: { communities: [{ community: "hive-125125", title: "Photography Lovers", count: 3 }] },
    total_estimate: 312,
    head_lag_seconds: 4,
    generated_at: iso(0),
    ...overrides,
  };
}

export function makeStatus(overrides: Partial<CurationStatus> = {}): CurationStatus {
  return {
    team_cursor: { post_id: null, created: null },
    behind_seconds: 9660,
    counts: { unreviewed: 312, curated_24h: 61, trail_votes_today: { posts: 58, comments: 3 }, recommended_posts: 14 },
    mana_spent_today: { equiv: 79, trail: 61, other: 18, crosscheck: 80, since: iso(-12 * 3_600_000) },
    vp: {
      account: "ecency",
      percent: 82.1,
      live_percent: 82.4,
      implied_weight: 560,
      at: iso(-30_000),
      sustainable_votes_per_day: 179,
      regen_votes_per_hour: 7.4,
    },
    head_lag_seconds: 7,
    reco_lag_blocks: 1,
    feed_version: "v1",
    latest_post_id: 1,
    worker_tick_age_seconds: 3,
    ...overrides,
  };
}

export function makePost(row: CurationRosterRow, overrides: Partial<CurationPost> = {}): CurationPost {
  const { overlay: _overlay, ...publicRow } = row;
  return {
    ...publicRow,
    recommenders: [],
    no_meta_count: 0,
    reasons: {},
    ...overrides,
  };
}

export interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

export type FetchRoute = (url: string, init: RequestInit | undefined) => unknown | Promise<unknown> | undefined;

export function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

interface RouterState {
  calls: RecordedCall[];
  routes: Array<{ match: RegExp; handler: FetchRoute }>;
}

// ONE stable fetch function for the whole spec file: the SDK's getBoundFetch()
// caches `globalThis.fetch.bind(globalThis)` on first use, so a fresh vi.fn per
// test would never be reached. The stable function dispatches to the router
// installed by the current test.
let current: RouterState = { calls: [], routes: [] };
const stableFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  let body: Record<string, unknown> | null = null;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = null;
    }
  }
  current.calls.push({ url, method, body });
  for (const route of current.routes) {
    if (route.match.test(url)) {
      const result = await route.handler(url, init);
      if (result === undefined) continue;
      if (result && typeof result === "object" && "ok" in (result as object) && "json" in (result as object)) {
        return result;
      }
      return jsonResponse(result);
    }
  }
  return jsonResponse({ error: `unrouted ${method} ${url}` }, 404);
});

/**
 * Stubs global fetch with a URL router. Routes return a body (wrapped in a
 * 200 JSON response) or a full response object produced by jsonResponse().
 */
export function installFetchRouter() {
  const state: RouterState = { calls: [], routes: [] };
  current = state;
  vi.stubGlobal("fetch", stableFetch);
  return {
    calls: state.calls,
    fetchMock: stableFetch,
    on(match: RegExp, handler: FetchRoute) {
      state.routes.unshift({ match, handler });
      return this;
    },
    callsTo(pattern: RegExp) {
      return state.calls.filter((c) => pattern.test(c.url));
    },
    reset() {
      state.calls.length = 0;
    },
  };
}

/** Minimal roster body: the listed names are curators, "trial1" is a trial. */
export function makeRoster(curators: string[] = ["curator1"]) {
  return {
    curators: [
      ...curators.map((username) => ({ username, role: "curator", active: true, rules: null })),
      { username: "trial1", role: "trial", active: true, rules: null },
      { username: "mod1", role: "mod", active: true, rules: null },
    ],
    updated_at: iso(0),
  };
}
