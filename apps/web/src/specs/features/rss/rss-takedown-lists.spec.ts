// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setDmcaLists } = vi.hoisted(() => ({ setDmcaLists: vi.fn() }));

vi.mock("@ecency/sdk", () => ({ ConfigManager: { setDmcaLists } }));
// The global @/utils mock keeps two members; the handler needs makeEntryPath,
// taken from its own leaf rather than by widening the barrel mock.
vi.mock("@/utils", async () => ({
  makeEntryPath: (
    await vi.importActual<typeof import("@/utils/make-path")>("@/utils/make-path")
  ).makeEntryPath
}));

/**
 * By outcome, not by reading the source: importing the base class every RSS
 * route builds on must load the takedown lists. The six feed routes are route
 * handlers, so nothing else does it for them and a cold worker served a full
 * <item> for a taken-down post (#1862).
 */
describe("RSS routes and the takedown lists", () => {
  beforeEach(() => {
    // The registry is shared with other specs in this worker, so without a
    // reset the handler may already be evaluated and its module-top call would
    // have run against a different mock instance.
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("loads them when the shared handler module is loaded", async () => {
    expect(setDmcaLists).not.toHaveBeenCalled();

    await import("@/features/rss/entries-rss-handler");

    expect(setDmcaLists).toHaveBeenCalled();
    expect(setDmcaLists.mock.calls[0][0].posts.length).toBeGreaterThan(0);
  });

  it("drops a taken-down post from the feed instead of shipping an empty item", async () => {
    // The filter leaves it with an empty title and the notice as its body, so
    // keeping it would put a titleless item in every reader. The agent
    // endpoints 404 it for the same reason.
    const { EntriesRssHandler } = await import("@/features/rss/entries-rss-handler");

    class TestFeed extends EntriesRssHandler {
      protected pathname = "/test/rss";
      protected async fetchData() {
        return [];
      }
      public included(entry: unknown) {
        return this.includeItem(entry as never);
      }
    }

    const feed = new TestFeed();

    expect(feed.included({ author: "boombaam1", permlink: "coinbase-customer-service-1-8o8-e007d0f9ebe" })).toBe(false);
    expect(feed.included({ author: "someoneelse", permlink: "a-fine-post" })).toBe(true);
  });
});
