// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { init, configureLazySentry } = vi.hoisted(() => ({
  init: vi.fn(),
  configureLazySentry: vi.fn()
}));

vi.mock("@sentry/nextjs", () => ({ init, setTag: vi.fn() }));
vi.mock("@sentry/profiling-node", () => ({ nodeProfilingIntegration: vi.fn(() => ({})) }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ configureLazySentry }));

const TOKEN_URL = "https://i.ecency.com/hs/SECRET";
const SCRUBBED = "https://i.ecency.com/hs/[Filtered]";

type Hooks = {
  beforeSend?: (e: unknown) => unknown;
  beforeSendTransaction?: (e: unknown) => unknown;
  beforeBreadcrumb?: (c: unknown) => unknown;
};

function crumbUrl(hooks: Hooks) {
  const crumb = hooks.beforeBreadcrumb!({ category: "fetch", data: { url: TOKEN_URL } }) as {
    data: { url: string };
  };
  return crumb.data.url;
}

/**
 * Issue #1651: the scrubber is only as good as its wiring. Each Sentry config
 * must hand every outbound path (errors, transactions, breadcrumbs) to it.
 */
describe("Sentry config wiring to the URL scrubber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("client: beforeSend is the shared hook and beforeBreadcrumb scrubs", async () => {
    await import("../../../sentry.client.config");
    const { beforeSend } = await import("@/utils/sentry-before-send");
    const opts = configureLazySentry.mock.calls[0][0] as Hooks;
    expect(opts.beforeSend).toBe(beforeSend);
    expect(crumbUrl(opts)).toBe(SCRUBBED);
  });

  it.each([
    ["server", () => import("../../../sentry.server.config")],
    ["edge", () => import("../../../sentry.edge.config")]
  ])("%s: beforeSend, beforeSendTransaction and beforeBreadcrumb scrub", async (_n, load) => {
    await load();
    const opts = init.mock.calls[0][0] as Hooks;
    const err = opts.beforeSend!({ request: { url: TOKEN_URL } }) as { request: { url: string } };
    expect(err.request.url).toBe(SCRUBBED);
    const tx = opts.beforeSendTransaction!({
      type: "transaction",
      spans: [{ data: { "url.full": TOKEN_URL } }]
    }) as { spans: { data: Record<string, string> }[] };
    expect(tx.spans[0].data["url.full"]).toBe(SCRUBBED);
    expect(crumbUrl(opts)).toBe(SCRUBBED);
  });

  // Issue #2000: a record lookup that failed upstream is answered with a
  // retryable 503 and counted in the ssr-degraded log line. It is an expected
  // upstream condition, not a code defect, so it must not reach Sentry.
  it("server: drops a lookup-unavailable error and keeps every other error", async () => {
    await import("../../../sentry.server.config");
    const opts = init.mock.calls[0][0] as Hooks;
    const lookup = {
      exception: { values: [{ type: "SsrLookupUnavailableError", value: "account lookup failed" }] }
    };
    expect(opts.beforeSend!(lookup)).toBeNull();
    const other = { exception: { values: [{ type: "TypeError", value: "x is undefined" }] } };
    expect(opts.beforeSend!(other)).not.toBeNull();
  });
});
