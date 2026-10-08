import { describe, expect, it } from "vitest";
import { findKeyAuthority, keySatisfiesAuthority } from "@/utils/key-authority";

const account = {
  owner: { key_auths: [["STM_OWNER", 1]] as [string, number][] },
  active: { key_auths: [["STM_ACTIVE", 1]] as [string, number][] },
  posting: { key_auths: [["STM_POSTING", 1], ["STM_SHARED", 1]] as [string, number][] }
};

describe("findKeyAuthority", () => {
  it("returns the authority holding the key", () => {
    expect(findKeyAuthority(account, "STM_OWNER")).toBe("owner");
    expect(findKeyAuthority(account, "STM_ACTIVE")).toBe("active");
    expect(findKeyAuthority(account, "STM_POSTING")).toBe("posting");
  });

  it("returns null for a key the account does not hold", () => {
    expect(findKeyAuthority(account, "STM_NOPE")).toBeNull();
  });

  it("returns the strongest authority when a key sits in several", () => {
    const shared = {
      ...account,
      active: { key_auths: [["STM_SHARED", 1]] as [string, number][] }
    };
    expect(findKeyAuthority(shared, "STM_SHARED")).toBe("active");
  });
});

describe("keySatisfiesAuthority", () => {
  it("owner satisfies everything, active satisfies active and posting", () => {
    expect(keySatisfiesAuthority("owner", "owner")).toBe(true);
    expect(keySatisfiesAuthority("owner", "active")).toBe(true);
    expect(keySatisfiesAuthority("active", "posting")).toBe(true);
  });

  it("a weaker key never satisfies a stronger requirement", () => {
    expect(keySatisfiesAuthority("active", "owner")).toBe(false);
    expect(keySatisfiesAuthority("posting", "active")).toBe(false);
    expect(keySatisfiesAuthority(null, "posting")).toBe(false);
  });
});
