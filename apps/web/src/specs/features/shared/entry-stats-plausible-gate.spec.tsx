import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEntry, renderWithQueryClient } from "@/specs/test-utils";

// #1973: with Plausible turned off in the config the stats API answers 404,
// yet the post's eye button still queried it for every signed in reader.
const flags = vi.hoisted(() => ({ plausible: true }));
const statsQueryFn = vi.hoisted(() => vi.fn(async () => ({ results: [{ metrics: [3, 7] }] })));

vi.mock("@/config", async () => ({
  ...(await vi.importActual<object>("@/config")),
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) =>
      fn({ visionFeatures: { plausible: { enabled: flags.plausible } } })
  }
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getStatsQueryOptions: (params: { url: string; metrics: string[]; enabled?: boolean }) => ({
      queryKey: ["stats", params.url, params.metrics.join(",")],
      queryFn: statsQueryFn,
      enabled: params.enabled ?? true
    })
  };
});

vi.mock("@/core/hooks", async () => ({
  ...(await vi.importActual<object>("@/core/hooks")),
  useActiveAccount: () => ({ activeUser: { username: "alice" }, username: "alice" })
}));

import { EntryStats } from "@/features/shared/entry-stats";

describe("EntryStats and the plausible feature flag (#1973)", () => {
  beforeEach(() => {
    statsQueryFn.mockClear();
  });

  it("queries and shows views when plausible is enabled", async () => {
    flags.plausible = true;
    renderWithQueryClient(<EntryStats entry={mockEntry({ author: "bob", permlink: "p" })} />);
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(statsQueryFn).toHaveBeenCalled();
  });

  it("asks nothing and renders nothing when plausible is disabled", async () => {
    flags.plausible = false;
    const { container } = renderWithQueryClient(
      <EntryStats entry={mockEntry({ author: "bob", permlink: "p" })} />
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(statsQueryFn).not.toHaveBeenCalled();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
