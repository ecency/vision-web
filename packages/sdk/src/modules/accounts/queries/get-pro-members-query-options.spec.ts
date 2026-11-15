import { describe, expect, it } from "vitest";
import { proMembersSet } from "./get-pro-members-query-options";

// The roster is an unauthenticated JSON response: a bad body must not throw in
// every Pro badge and on the perks page.
describe("proMembersSet", () => {
  it("lowercases member names", () => {
    expect([...proMembersSet(["Alice", "bob"])]).toEqual(["alice", "bob"]);
  });

  it("is empty for a missing roster", () => {
    expect(proMembersSet(undefined).size).toBe(0);
  });

  it("is empty for a roster that is not an array", () => {
    expect(proMembersSet({} as unknown as string[]).size).toBe(0);
  });

  it("skips entries that are not strings", () => {
    expect([...proMembersSet([null, "Bob", 7] as unknown as string[])]).toEqual(["bob"]);
  });
});
