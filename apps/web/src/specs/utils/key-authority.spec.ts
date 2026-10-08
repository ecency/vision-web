import { describe, expect, it } from "vitest";
import { canKeySignAuthority, findKeyAuthority, keySatisfiesAuthority } from "@/utils/key-authority";

const none: [string, number][] = [];
const account = {
  owner: { key_auths: [["STM_OWNER", 1]] as [string, number][], account_auths: none },
  active: { key_auths: [["STM_ACTIVE", 1]] as [string, number][], account_auths: none },
  posting: {
    key_auths: [["STM_POSTING", 1], ["STM_SHARED", 1]] as [string, number][],
    account_auths: none
  }
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
      active: { key_auths: [["STM_SHARED", 1]] as [string, number][], account_auths: none }
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

describe("canKeySignAuthority", () => {
  it("accepts a key held directly in a sufficient authority", () => {
    expect(canKeySignAuthority(account, "STM_OWNER", "owner")).toBe(true);
    expect(canKeySignAuthority(account, "STM_OWNER", "active")).toBe(true);
    expect(canKeySignAuthority(account, "STM_ACTIVE", "active")).toBe(true);
  });

  it("blocks a key the account does not hold when nothing is delegated", () => {
    expect(canKeySignAuthority(account, "STM_ACTIVE", "owner")).toBe(false);
    expect(canKeySignAuthority(account, "STM_NOPE", "active")).toBe(false);
  });

  it("lets an unknown key through when a sufficient authority delegates to an account", () => {
    // The chain resolves account_auths recursively; the client cannot, so it
    // must not reject a key that may belong to the delegated account.
    const delegated = {
      ...account,
      owner: { ...account.owner, account_auths: [["recovery-helper", 1]] as [string, number][] }
    };
    expect(canKeySignAuthority(delegated, "STM_UNKNOWN", "owner")).toBe(true);
    expect(canKeySignAuthority(delegated, "STM_UNKNOWN", "active")).toBe(true);

    // A delegation on a WEAKER authority does not help a stronger requirement.
    const postingOnly = {
      ...account,
      posting: { ...account.posting, account_auths: [["ecency.app", 1]] as [string, number][] }
    };
    expect(canKeySignAuthority(postingOnly, "STM_UNKNOWN", "active")).toBe(false);
    expect(canKeySignAuthority(postingOnly, "STM_UNKNOWN", "posting")).toBe(true);
  });
});
