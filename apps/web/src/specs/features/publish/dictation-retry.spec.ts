import { describe, expect, test } from "vitest";
import { nextRetryAction } from "@/app/publish/_hooks/dictation-retry";

/**
 * One button, two failures that need opposite handling. Doing both is the bug: on a
 * session failure the pricing query is disabled for want of a token, and refetch()
 * bypasses `enabled`, so it sends an unauthenticated request. That error sticks,
 * because the query is keyed by username alone and its key does not change when a
 * token finally arrives.
 */
describe("nextRetryAction", () => {
  test("a failed session retries the token, not pricing", () => {
    expect(nextRetryAction("failed", false)).toBe("resolve-token");
  });

  test("a failed session retries the token even when pricing also errored", () => {
    // Pricing errored *because* there was no token; refetching it solves nothing.
    expect(nextRetryAction("failed", true)).toBe("resolve-token");
  });

  test("a genuine pricing failure retries pricing", () => {
    expect(nextRetryAction("ready", true)).toBe("refetch-price");
  });

  test("nothing to retry while the token is still resolving", () => {
    expect(nextRetryAction("pending", false)).toBe("none");
    expect(nextRetryAction("pending", true)).toBe("none");
  });

  test("nothing to retry when both are healthy", () => {
    expect(nextRetryAction("ready", false)).toBe("none");
  });
});
