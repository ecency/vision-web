import { describe, expect, it } from "vitest";
import { OPERATION_AUTHORITY_MAP, getOperationAuthority } from "./authority-map";

describe("authority map: account recovery operations", () => {
  it("signs request_account_recovery with the recovery account's active key", () => {
    expect(OPERATION_AUTHORITY_MAP.request_account_recovery).toBe("active");
    expect(
      getOperationAuthority([
        "request_account_recovery",
        {
          recovery_account: "ecency",
          account_to_recover: "alice",
          new_owner_authority: { weight_threshold: 1, account_auths: [], key_auths: [] },
          extensions: [],
        },
      ] as any)
    ).toBe("active");
  });

  it("keeps the owner-level recovery operations on owner", () => {
    expect(OPERATION_AUTHORITY_MAP.recover_account).toBe("owner");
    expect(OPERATION_AUTHORITY_MAP.change_recovery_account).toBe("owner");
  });
});
