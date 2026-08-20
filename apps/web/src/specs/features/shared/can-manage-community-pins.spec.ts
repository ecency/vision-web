import { describe, expect, it } from "vitest";
import { canManageCommunityPins } from "@/features/shared/entry-menu/can-manage-community-pins";
import { ROLES, type Community } from "@/entities";

const community = (team: [string, string][]) => ({ name: "hive-125125", team } as unknown as Community);

describe("canManageCommunityPins", () => {
  it.each([
    ["owner", ROLES.OWNER.toString()],
    ["admin", ROLES.ADMIN.toString()],
    ["mod", ROLES.MOD.toString()]
  ])("allows a community %s", (_label, role) => {
    expect(canManageCommunityPins(community([["alice", role]]), "alice")).toBe(true);
  });

  it("refuses a member with no moderating role", () => {
    expect(canManageCommunityPins(community([["alice", ROLES.MEMBER.toString()]]), "alice")).toBe(
      false
    );
  });

  it("refuses someone who is not on the team", () => {
    expect(canManageCommunityPins(community([["bob", ROLES.OWNER.toString()]]), "alice")).toBe(false);
  });

  it("refuses an anonymous viewer even where the team is known", () => {
    expect(canManageCommunityPins(community([["alice", ROLES.OWNER.toString()]]), undefined)).toBe(
      false
    );
  });

  it("refuses when the community has not loaded yet", () => {
    // The gate is consulted before community data arrives, and must not fetch
    // a community page on the strength of an unknown role.
    expect(canManageCommunityPins(undefined, "alice")).toBe(false);
    expect(canManageCommunityPins(null, "alice")).toBe(false);
  });
});
