import React from "react";
import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makeRoster, makeStatus } from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: "curator1" as string | undefined }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (condition: (config: unknown) => unknown) =>
      condition({
        visionFeatures: {
          curationDesk: { enabled: true, recommendations: { enabled: true }, applications: { enabled: true } },
        },
      }),
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/curation" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));

import { CurationTabs } from "@/app/curation/_components/curation-tabs";

/** The number on a tab, or null when the tab shows none. */
function badge(tab: string): string | null {
  const link = screen.getByText(`curation-desk.tabs.${tab}`).closest("a");
  return link?.querySelector("span")?.textContent ?? null;
}

/**
 * The recommendations tab opens the roster's recommended view for a curator,
 * which leaves out what the team handled, and the public list for everyone
 * else, so the badge counts the list the viewer will see.
 */
describe("recommendations tab badge", () => {
  let router: ReturnType<typeof installFetchRouter>;
  let status: ReturnType<typeof makeStatus>;

  beforeEach(() => {
    state.username = "curator1";
    const base = makeStatus();
    status = {
      ...base,
      counts: { ...base.counts, recommended_posts: 14, recommended_unhandled: 3 },
    } as ReturnType<typeof makeStatus>;
    router = installFetchRouter()
      .on(/curation-desk\/status/, () => status)
      .on(/curation-desk\/roster$/, () => makeRoster(["curator1"]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts what is left to handle for a curator", async () => {
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(badge("recommendations")).toBe("3"));
  });

  it("counts the public list for a member", async () => {
    state.username = "member1";
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(router.callsTo(/curation-desk\/roster$/)).toHaveLength(1));
    await waitFor(() => expect(badge("recommendations")).toBe("14"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(badge("recommendations")).toBe("14");
  });

  /**
   * Until the role is known the tab does not know which list it opens, so a
   * curator whose role is still loading sees no count rather than the public one.
   */
  it("shows no recommendations count while the role is still loading", async () => {
    let answer: (body: unknown) => void = () => undefined;
    router.on(
      /curation-desk\/roster$/,
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(badge("queue")).toBe(String(status.counts.unreviewed)));
    expect(badge("recommendations")).toBeNull();
    answer(makeRoster(["curator1"]));
    await waitFor(() => expect(badge("recommendations")).toBe("3"));
  });

  it("falls back to the public count for a curator on a desk that sends no curator count", async () => {
    status = makeStatus();
    renderWithQueryClient(<CurationTabs />);
    await waitFor(() => expect(router.callsTo(/curation-desk\/roster$/)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(badge("recommendations")).toBe(String(makeStatus().counts.recommended_posts));
  });
});
