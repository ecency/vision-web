// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue #2000: every profile and community page needs its account or community
// record to render. A lookup that FAILED (RPC error, rate limit, timeout) must
// not be answered as "does not exist": the page throws a lookup-unavailable
// error, which goes out as a retryable 503, instead of calling notFound().
// A lookup that SUCCEEDED and found nothing still answers notFound().
//
// The pages run through the real prefetchRequired and a real query client
// (node environment: server retry is off, as in production). Only the SDK
// query builders are driven per test.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "ecency.com" })
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({})
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/features/i18n", () => ({ initI18next: async () => undefined }));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// The first page import compiles the whole route tree.
vi.setConfig({ testTimeout: 60_000 });

import { getAccountFullQueryOptions, getCommunityQueryOptions } from "@ecency/sdk";
import { SsrLookupUnavailableError } from "@/core/react-query";

type Outcome = "fails" | "missing" | "not-found-assert";

function lookup(outcome: Outcome) {
  return async () => {
    if (outcome === "fails") throw new Error("HTTP 429 rate limited");
    if (outcome === "not-found-assert") {
      throw new Error("Assert Exception:given community name is not valid");
    }
    return null;
  };
}

let accountOutcome: Outcome = "fails";
let communityOutcome: Outcome = "fails";

beforeEach(() => {
  vi.mocked(getAccountFullQueryOptions).mockImplementation(
    (username?: string) =>
      ({ queryKey: ["accounts", "full", username], queryFn: lookup(accountOutcome) }) as any
  );
  vi.mocked(getCommunityQueryOptions).mockImplementation(
    (name?: string) =>
      ({ queryKey: ["communities", "single", name], queryFn: lookup(communityOutcome) }) as any
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

const user = { username: "alice" };
const none = Promise.resolve({});

// Each entry renders one route branch; `before` selects the archive branch.
const PROFILE_PAGES: Array<[string, () => Promise<any>, Record<string, unknown>]> = [
  ["/@alice", () => import("@/app/(dynamicPages)/profile/[username]/page"), {}],
  ["/@alice/posts", () => import("@/app/(dynamicPages)/profile/[username]/[section]/page"), { section: "posts" }],
  ["/@alice/posts?before=", () => import("@/app/(dynamicPages)/profile/[username]/[section]/page"), { section: "posts", before: "alice/older" }],
  ["/@alice/followers", () => import("@/app/(dynamicPages)/profile/[username]/followers/page"), {}],
  ["/@alice/following", () => import("@/app/(dynamicPages)/profile/[username]/following/page"), {}],
  ["/@alice/trail", () => import("@/app/(dynamicPages)/profile/[username]/trail/page"), {}],
  ["/@alice/communities", () => import("@/app/(dynamicPages)/profile/[username]/communities/page"), {}],
  ["/@alice/permissions", () => import("@/app/(dynamicPages)/profile/[username]/permissions/page"), {}],
  ["/@alice/settings", () => import("@/app/(dynamicPages)/profile/[username]/settings/page"), {}],
  ["/@alice/referrals", () => import("@/app/(dynamicPages)/profile/[username]/referrals/page"), {}],
  ["/@alice/insights", () => import("@/app/(dynamicPages)/profile/[username]/insights/page"), {}]
];

const COMMUNITY_PAGES: Array<[string, () => Promise<any>, Record<string, unknown>]> = [
  ["/created/hive-125125", () => import("@/app/(dynamicPages)/community/[community]/page"), {}],
  ["/trending/hive-125125", () => import("@/app/(dynamicPages)/community/[community]/[tag]/page"), { tag: "trending" }],
  ["/trending/hive-125125?before=", () => import("@/app/(dynamicPages)/community/[community]/[tag]/page"), { tag: "trending", before: "alice/older" }],
  ["/hive-125125/activities", () => import("@/app/(dynamicPages)/community/[community]/activities/page"), {}],
  ["/hive-125125/subscribers", () => import("@/app/(dynamicPages)/community/[community]/subscribers/page"), {}],
  ["/hive-125125/roles", () => import("@/app/(dynamicPages)/community/[community]/roles/page"), {}]
];

function render(load: () => Promise<any>, params: Record<string, unknown>, base: Record<string, unknown>) {
  const { before, ...rest } = params;
  return load().then((mod) =>
    mod.default({
      params: Promise.resolve({ ...base, ...rest }),
      searchParams: before ? Promise.resolve({ before }) : none
    })
  );
}

describe("profile pages when the account lookup fails or finds nothing", () => {
  it.each(PROFILE_PAGES)("%s throws lookup-unavailable when the lookup failed", async (_, load, params) => {
    accountOutcome = "fails";
    await expect(render(load, params, user)).rejects.toBeInstanceOf(SsrLookupUnavailableError);
  });

  it.each(PROFILE_PAGES)("%s answers not found when the account does not exist", async (_, load, params) => {
    accountOutcome = "missing";
    await expect(render(load, params, user)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("community pages when the community lookup fails or finds nothing", () => {
  const base = { community: "hive-125125" };

  it.each(COMMUNITY_PAGES)("%s throws lookup-unavailable when the lookup failed", async (_, load, params) => {
    communityOutcome = "fails";
    await expect(render(load, params, base)).rejects.toBeInstanceOf(SsrLookupUnavailableError);
  });

  it.each(COMMUNITY_PAGES)("%s answers not found when a node asserts it does not exist", async (_, load, params) => {
    communityOutcome = "not-found-assert";
    await expect(render(load, params, base)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// Wave posts and replies (`wave-*` permlinks redirect here from the post
// route) had the same pattern: a failed post lookup answered notFound().
describe("the wave page when the post lookup fails or finds nothing", () => {
  const params = { author: "alice", permlink: "wave-abc" };
  const load = () => import("@/app/waves/[author]/[permlink]/page");

  let postLookup: () => Promise<unknown>;
  beforeEach(async () => {
    const { EcencyEntriesCacheManagement } = await import("@/core/caches");
    vi.spyOn(EcencyEntriesCacheManagement, "getEntryQueryByPath").mockImplementation(
      (author?: string, permlink?: string) =>
        ({ queryKey: ["entry", author, permlink], queryFn: () => postLookup() }) as any
    );
  });

  it("throws lookup-unavailable when the lookup failed", async () => {
    postLookup = async () => {
      throw new Error("HTTP 429 rate limited");
    };
    await expect(render(load, {}, params)).rejects.toBeInstanceOf(SsrLookupUnavailableError);
  });

  it("answers not found for an author no account can have", async () => {
    postLookup = async () => {
      throw new Error("Assert Exception:invalid account char");
    };
    await expect(render(load, {}, { author: "Alice", permlink: "wave-abc" })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("answers not found when a node asserts the post does not exist", async () => {
    postLookup = async () => {
      throw new Error("Assert Exception:Post alice/wave-abc does not exist");
    };
    await expect(render(load, {}, params)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
