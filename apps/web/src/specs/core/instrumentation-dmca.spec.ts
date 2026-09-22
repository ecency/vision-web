// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setDmcaLists } = vi.hoisted(() => ({ setDmcaLists: vi.fn() }));

vi.mock("@ecency/sdk", () => ({ ConfigManager: { setDmcaLists } }));
vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../../sentry.server.config", () => ({}));
vi.mock("@/event-loop-monitor", () => ({ initEventLoopMonitor: vi.fn() }));

/**
 * The process-level fallback. Every entry point that serves post data calls
 * the loader itself, but instrumentation is the one place Next runs before any
 * request for pages, route handlers and middleware alike, and it cannot be
 * tree-shaken. It is what covers the NEXT route that serves posts and forgets
 * to load them, which is how #1862 happened.
 */
describe("instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("loads the takedown lists on a Node server process", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(setDmcaLists).toHaveBeenCalled();
    expect(setDmcaLists.mock.calls[0][0].posts.length).toBeGreaterThan(0);
    vi.unstubAllEnvs();
  });

  // Only one register() per file: it defines a non-configurable `_bitcore`
  // on the global, so a second call in the same process throws.

});
