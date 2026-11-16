import { describe, expect, it, vi } from "vitest";

// #395: the notifications section is an activity log of links to other pages,
// so it is kept out of search results while its links are still followed.
vi.mock("@/app/(dynamicPages)/profile/[username]/_helpers", () => ({
  generateProfileMetadata: vi.fn(async (username: string, section: string) => ({
    title: `${username} ${section}`
  }))
}));

import { generateMetadata } from "@/app/(dynamicPages)/profile/[username]/notifications/page";

describe("/@username/notifications metadata (#395)", () => {
  it("is noindex, follow and keeps the profile metadata", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ username: "%40bob" }) }, {} as never);

    expect(meta.robots).toBe("noindex, follow");
    expect(meta.title).toBe("bob notifications");
  });
});
