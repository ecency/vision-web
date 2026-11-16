import { describe, it, expect, beforeEach } from "vitest";
import { failedDeclineKey, rememberFailedDecline } from "@/features/shared/comment/failed-decline";

const stored = () => window.localStorage.getItem("ecency_reply_failed_decline_alice_bob_post");

describe("rememberFailedDecline", () => {
  beforeEach(() => window.localStorage.clear());

  it("keys the decline by sender and parent post, the key the composer reads", () => {
    expect(failedDeclineKey("alice", "bob", "post")).toBe("reply_failed_decline_alice_bob_post");
  });

  it("stores a declined failure's exact text", () => {
    rememberFailedDecline("alice", "bob", "post", "hello", true);
    expect(stored()).toBe(JSON.stringify("hello"));
  });

  it("an undeclined failure of other text leaves the stored decline alone", () => {
    rememberFailedDecline("alice", "bob", "post", "hello", true);
    rememberFailedDecline("alice", "bob", "post", "something else", false);
    expect(stored()).toBe(JSON.stringify("hello"));
  });

  it("an undeclined failure of the same text drops it", () => {
    rememberFailedDecline("alice", "bob", "post", "hello", true);
    rememberFailedDecline("alice", "bob", "post", "hello", false);
    expect(stored()).toBeNull();
  });

  it("stores nothing without a sender", () => {
    rememberFailedDecline("", "bob", "post", "hello", true);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });
});
