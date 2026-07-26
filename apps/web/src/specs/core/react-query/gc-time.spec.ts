import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `isServer` is read at module load, so each case needs the module re-imported
 * with the flag it is asserting about.
 */
async function loadWith(isServer: boolean) {
  vi.resetModules();
  vi.doMock("@tanstack/react-query", async () => ({
    ...(await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")),
    isServer
  }));
  return import("@/core/react-query");
}

function gcTimeOf(client: { getDefaultOptions: () => { queries?: { gcTime?: number } } }) {
  return client.getDefaultOptions().queries?.gcTime;
}

describe("query client gcTime", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * The regression this guards. Every query a render creates schedules a gc
   * timer, and a pending timer is a GC root — so a server process retains each
   * request's data for the whole gcTime regardless of the client being
   * per-request, settling at roughly `ingest rate × gcTime`. At ecency.com
   * volume a 10-minute window put that steady state above the renderer's
   * old-space cap, so it aborted on the way there instead of levelling off.
   */
  it("keeps the server window short enough to bound the retained working set", async () => {
    const { makeQueryClient } = await loadWith(true);

    expect(gcTimeOf(makeQueryClient())).toBe(2 * 60 * 1000);
  });

  it("leaves the browser window long, where the working set is one user's", async () => {
    const { makeQueryClient } = await loadWith(false);

    expect(gcTimeOf(makeQueryClient())).toBe(10 * 60 * 1000);
  });

  it("gives the server a strictly shorter window than the browser", async () => {
    const server = gcTimeOf((await loadWith(true)).makeQueryClient());
    const browser = gcTimeOf((await loadWith(false)).makeQueryClient());

    expect(server).toBeLessThan(browser!);
  });

  /**
   * A single server render takes ~1-5s; the window only has to outlast that,
   * since the data is dehydrated into the payload as soon as the render ends.
   * Guards against tightening this so far that entries expire mid-render.
   */
  it("still outlasts a single server render by a wide margin", async () => {
    const { makeQueryClient } = await loadWith(true);

    expect(gcTimeOf(makeQueryClient())).toBeGreaterThanOrEqual(30 * 1000);
  });
});
