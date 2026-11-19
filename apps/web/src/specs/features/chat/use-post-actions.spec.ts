import { describe, it, expect } from "vitest";
import { canPinInChannel } from "@/features/chat/utils/pin-permission";

describe("canPinInChannel (use-post-actions canPin)", () => {
  it("is false for a group member who does not moderate", () => {
    expect(canPinInChannel({ type: "G", isMember: true, canModerate: false })).toBe(false);
  });

  it("is false for a private channel member who does not moderate", () => {
    expect(canPinInChannel({ type: "P", isMember: true, canModerate: false })).toBe(false);
  });

  it("is true for a direct message member, and false for a DM the viewer is not in", () => {
    expect(canPinInChannel({ type: "D", isMember: true, canModerate: false })).toBe(true);
    expect(canPinInChannel({ type: "D", isMember: false, canModerate: false })).toBe(false);
  });

  it("is true for a community moderator, and false for a community member", () => {
    expect(canPinInChannel({ type: "O", isMember: true, canModerate: true })).toBe(true);
    expect(canPinInChannel({ type: "O", isMember: true, canModerate: false })).toBe(false);
  });
});
