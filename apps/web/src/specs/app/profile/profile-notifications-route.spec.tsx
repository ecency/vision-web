import { describe, expect, it, vi } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// #395: /@username/notifications must reach the profile section, not the
// entry route (which would read "notifications" as a permlink), and the
// profile menu must link to it.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/@bob/posts"
}));

import routes from "@/routes";
import { ProfileMenu } from "@/app/(dynamicPages)/profile/[username]/_components/profile-menu";

describe("/@username/notifications route (#395)", () => {
  it("rewrites the section to the profile route", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../../../../next.config.js"), "utf8");
    const rewrite = config.match(
      /source:\s*"\/:author\(@\.\+\)\/:section\(([^)]*)\)",\s*destination:\s*"\/profile\/:author\/:section"/
    );

    expect(rewrite).not.toBeNull();
    expect(rewrite![1].split("|")).toContain("notifications");
  });

  it("is a known profile section route", () => {
    expect(routes.USER_SECTION).toMatch(/\|notifications[|)]/);
  });

  it("is linked from the profile menu", () => {
    render(<ProfileMenu username="bob" />);

    fireEvent.click(screen.getByRole("button", { name: "g.menu" }));

    const links = screen
      .getAllByText("profile.section-notifications")
      .map((el) => el.closest("a")?.getAttribute("href"));
    expect(links).toContain("/@bob/notifications");
  });
});
