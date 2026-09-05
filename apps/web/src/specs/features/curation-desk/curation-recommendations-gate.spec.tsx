import React from "react";
import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makeRoster, makeStatus } from "./curation-test-utils";

const flags = vi.hoisted(() => ({
  recommendations: true,
  notFound: vi.fn(() => "not-found" as unknown as never),
}));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (condition: (config: unknown) => unknown) =>
      condition({
        visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: flags.recommendations } } },
      }),
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => flags.notFound(),
  usePathname: () => "/curation",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/metadata", () => ({
  PagesMetadataGenerator: { getForPage: vi.fn(async () => ({})) },
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => undefined }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));

import CurationRecommendationsPage from "@/app/curation/recommendations/page";
import { CurationTabs } from "@/app/curation/_components/curation-tabs";
import { CurationRecommendationsView } from "@/features/curation-desk/curation-recommendations-view";

/**
 * The recommendations sub-flag. Hiding the buttons leaves the route, its tab
 * and its public list reachable, which is the whole surface the flag exists to
 * close.
 */
describe("curationDesk.recommendations flag", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    flags.recommendations = true;
    flags.notFound.mockClear();
    router = installFetchRouter()
      .on(/curation-desk\/status/, () => makeStatus())
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/recommendations/, () => ({ items: [], next_cursor: null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers notFound on the route while the flag is off", () => {
    flags.recommendations = false;
    CurationRecommendationsPage();
    expect(flags.notFound).toHaveBeenCalled();

    flags.notFound.mockClear();
    flags.recommendations = true;
    CurationRecommendationsPage();
    expect(flags.notFound).not.toHaveBeenCalled();
  });

  it("omits the tab that points at the gated route", () => {
    flags.recommendations = false;
    const { unmount } = renderWithQueryClient(<CurationTabs />);
    expect(screen.queryByText("curation-desk.tabs.recommendations")).toBeNull();
    expect(screen.getByText("curation-desk.tabs.queue")).toBeInTheDocument();
    unmount();

    flags.recommendations = true;
    renderWithQueryClient(<CurationTabs />);
    expect(screen.getByText("curation-desk.tabs.recommendations")).toBeInTheDocument();
  });

  it("asks for no recommendations list while the flag is off", async () => {
    flags.recommendations = false;
    const { unmount } = renderWithQueryClient(<CurationRecommendationsView />);
    await waitFor(() => expect(screen.getByText("curation-desk.reco-view.empty")).toBeInTheDocument());
    expect(router.callsTo(/curation-desk\/recommendations/)).toHaveLength(0);
    unmount();

    flags.recommendations = true;
    renderWithQueryClient(<CurationRecommendationsView />);
    await waitFor(() => expect(router.callsTo(/curation-desk\/recommendations/)).toHaveLength(1));
  });
});
