import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());
const mockInvalidate = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/mutations")>();
  return {
    ...actual,
    useBroadcastMutation: mockUseBroadcastMutation,
    invalidateAfterBroadcast: mockInvalidate
  };
});

import { useDelegateRc } from "./use-delegate-rc";
import { QueryKeys } from "@/modules/core";

// #1973: delegate_rc is a custom_json signed by required_posting_auths. Since
// HF28's strict authority checks an active key can not sign a posting-auth op,
// so asking for active made key logins sign with the wrong key.
describe("useDelegateRc", () => {
  beforeEach(() => {
    mockUseBroadcastMutation.mockReset();
    mockUseBroadcastMutation.mockReturnValue({});
  });

  it("asks for posting authority, matching the op's required_posting_auths", () => {
    useDelegateRc("alice", { adapter: {} } as any, "sync");
    const [key, username, buildOps, , , authority, options] =
      mockUseBroadcastMutation.mock.calls[0];

    expect(key).toEqual(["wallet", "delegate-rc"]);
    expect(username).toBe("alice");
    expect(authority).toBe("posting");
    expect(options).toEqual({ broadcastMode: "sync" });

    const [op] = buildOps({ to: "bob", maxRc: "5000000000" });
    expect(op[0]).toBe("custom_json");
    expect(op[1].required_posting_auths).toEqual(["alice"]);
    expect(op[1].required_auths).toEqual([]);
  });

  // #2075: "bob, carol," is a list; each delegatee's cached account and RC
  // must refresh, not one entry keyed by the raw string.
  it("refreshes every delegatee of a list after the broadcast", async () => {
    mockInvalidate.mockResolvedValue(undefined);
    const adapter = {};
    useDelegateRc("alice", { adapter } as any, "sync");
    const onSuccess = mockUseBroadcastMutation.mock.calls[0][3];

    await onSuccess({}, { to: "bob, carol,", maxRc: 5 });

    const [, , keys] = mockInvalidate.mock.calls[0];
    expect(keys).toEqual([
      QueryKeys.accounts.full("alice"),
      QueryKeys.resourceCredits.account("alice"),
      QueryKeys.accounts.full("bob"),
      QueryKeys.resourceCredits.account("bob"),
      QueryKeys.accounts.full("carol"),
      QueryKeys.resourceCredits.account("carol")
    ]);
  });
});
