import { describe, expect, it } from "vitest";
import {
  buildRevokeKeysByAuthorityOp,
  revokeRequiredAuthority
} from "@/app/(dynamicPages)/profile/[username]/permissions/_components/revoke-keys-op";

const auth = (keys: string[]) => ({
  weight_threshold: 1,
  account_auths: [] as [string, number][],
  key_auths: keys.map((k) => [k, 1] as [string, number])
});

// K sits in owner, active and posting at once (a master-password owner key
// reused as posting, which happens on old accounts).
const account = {
  name: "alice",
  json_metadata: "{}",
  memo_key: "STM_MEMO",
  owner: auth(["STM_K"]),
  active: auth(["STM_K", "STM_A2"]),
  posting: auth(["STM_K", "STM_P2"])
};

describe("buildRevokeKeysByAuthorityOp", () => {
  it("removes a key only from the authorities it was ticked in and omits owner", () => {
    const [name, body] = buildRevokeKeysByAuthorityOp(account, {
      owner: [],
      active: [],
      posting: ["STM_K"]
    }) as unknown as [string, any];

    expect(name).toBe("account_update");
    expect(body).not.toHaveProperty("owner");
    expect(body.active.key_auths).toEqual([["STM_K", 1], ["STM_A2", 1]]);
    expect(body.posting.key_auths).toEqual([["STM_P2", 1]]);
    expect(body.memo_key).toBe("STM_MEMO");
    expect(body.json_metadata).toBe("{}");
    expect(revokeRequiredAuthority({ owner: [], active: [], posting: ["STM_K"] })).toBe("active");
  });

  it("includes owner only when an owner key is removed", () => {
    const body = (
      buildRevokeKeysByAuthorityOp(account, { owner: ["STM_K"], active: ["STM_K"], posting: [] }) as unknown as [string, any]
    )[1];
    expect(body.owner.key_auths).toEqual([]);
    expect(body.active.key_auths).toEqual([["STM_A2", 1]]);
    expect(body.posting.key_auths).toEqual([["STM_K", 1], ["STM_P2", 1]]);
    expect(revokeRequiredAuthority({ owner: ["STM_K"], active: [], posting: [] })).toBe("owner");
  });

  it("does not mutate the account data it reads", () => {
    const before = JSON.stringify(account);
    buildRevokeKeysByAuthorityOp(account, { owner: ["STM_K"], active: ["STM_K"], posting: ["STM_K"] });
    expect(JSON.stringify(account)).toBe(before);
  });
});
