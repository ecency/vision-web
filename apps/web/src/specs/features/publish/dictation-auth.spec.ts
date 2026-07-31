import { describe, expect, test } from "vitest";
import { tokenForUser } from "@/app/publish/_hooks/dictation-auth";

/**
 * The backend derives identity from the token, not from any username in the request.
 * So a token that outlives an account switch is not merely stale, it authenticates
 * as the wrong person: the pricing call returns the previous account's free
 * allowance, and React Query caches it under the new account's key.
 */
describe("tokenForUser", () => {
  test("returns the token when it belongs to the current user", () => {
    expect(tokenForUser({ username: "alice", token: "t-alice" }, "alice")).toBe("t-alice");
  });

  test("refuses a token belonging to a different user", () => {
    // The window after an account switch, before the new refresh resolves.
    expect(tokenForUser({ username: "alice", token: "t-alice" }, "bob")).toBeNull();
  });

  test("returns null when there is no token yet", () => {
    expect(tokenForUser(null, "alice")).toBeNull();
  });

  test("returns null when there is no active user", () => {
    expect(tokenForUser({ username: "alice", token: "t-alice" }, undefined)).toBeNull();
  });
});
