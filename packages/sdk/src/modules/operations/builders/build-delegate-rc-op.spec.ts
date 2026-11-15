import { describe, it, expect } from "vitest";
import { buildDelegateRcOp } from "./wallet";

function delegateesOf(op: ReturnType<typeof buildDelegateRcOp>): string[] {
  const [, payload] = op as [string, { json: string }];
  return JSON.parse(payload.json)[1].delegatees;
}

describe("buildDelegateRcOp delegatees (#2075)", () => {
  it("drops empty names from a list with a trailing or doubled comma, like the form", () => {
    expect(delegateesOf(buildDelegateRcOp("alice", "bob,carol,", 5))).toEqual(["bob", "carol"]);
    expect(delegateesOf(buildDelegateRcOp("alice", "bob,, carol", 5))).toEqual(["bob", "carol"]);
  });

  it("trims a single name", () => {
    expect(delegateesOf(buildDelegateRcOp("alice", " bob ", 5))).toEqual(["bob"]);
  });

  it("throws when no name is left", () => {
    expect(() => buildDelegateRcOp("alice", " , ", 5)).toThrow(/Missing required parameters/);
  });

  it("keeps a plain list as is, signed with posting authority", () => {
    const op = buildDelegateRcOp("alice", "bob,carol", 5);
    const [, payload] = op as [string, { json: string; required_posting_auths: string[] }];
    expect(delegateesOf(op)).toEqual(["bob", "carol"]);
    expect(JSON.parse(payload.json)).toEqual([
      "delegate_rc",
      { from: "alice", delegatees: ["bob", "carol"], max_rc: 5 }
    ]);
    expect(payload.required_posting_auths).toEqual(["alice"]);
  });
});
