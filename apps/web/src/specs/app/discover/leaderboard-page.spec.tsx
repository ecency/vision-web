import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = { _id: string; count: number; points: string; quests_done?: boolean };

const mocks = vi.hoisted(() => ({
  period: null as string | null,
  queryClient: null as QueryClient | null,
  queryFn: (async () => []) as (duration: string) => Promise<Row[]>
}));

type WithChildren = { children?: ReactNode };

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    Conditional: ({ children }: WithChildren) => <>{children}</>
  }
}));

vi.mock("@/app/discover/_components", () => ({
  UsersTableListLayout: ({ children }: WithChildren) => <div>{children}</div>,
  UsersTableListItem: ({ children, username }: WithChildren & { username: string }) => (
    <div data-username={username}>{children}</div>
  ),
  UserTableListHeader: ({ children }: WithChildren) => <div>{children}</div>
}));

vi.mock("@/app/discover/_components/discover-period-dropdown", () => ({
  DiscoverPeriodDropdown: () => null
}));

vi.mock("@tooni/iconscout-unicons-react", () => ({
  UilInfoCircle: () => null,
  UilCheckCircle: () => null
}));
vi.mock("@ui/tooltip", () => ({ Tooltip: ({ children }: WithChildren) => <>{children}</> }));
vi.mock("@ui/badge", () => ({ Badge: ({ children }: WithChildren) => <span>{children}</span> }));
vi.mock("@ui/svg", () => ({ medalSvg: null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.period ? { period: mocks.period } : {}),
  useParams: () => ({})
}));

vi.mock("@/core/react-query", () => ({
  getQueryClient: () => mocks.queryClient
}));

// the real QueryKeys, so the key here cannot drift from the SDK's
vi.mock("@ecency/sdk", async () => {
  const { QueryKeys } = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    QueryKeys,
    getDiscoverLeaderboardQueryOptions: (duration: string) => ({
      queryKey: QueryKeys.analytics.discoverLeaderboard(duration),
      queryFn: () => mocks.queryFn(duration)
    })
  };
});

import { QueryKeys } from "@ecency/sdk";
import LeaderboardPage from "@/app/discover/@leaderboard/page";

const rows: Row[] = [{ _id: "alice", count: 3, points: "1.000", quests_done: true }];

function page() {
  return (
    <QueryClientProvider client={mocks.queryClient!}>
      <LeaderboardPage searchParams={Promise.resolve({})} />
    </QueryClientProvider>
  );
}

const renderPage = () => render(page());

describe("Leaderboard page, UTC day reset", () => {
  beforeEach(() => {
    // a fixed clock that still lets react-query's promises settle
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-30T18:48:00Z"));
    vi.mocked(i18next.t).mockClear();
    // the app's client never refetches fresh data on mount by default
    mocks.queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } }
    });
    mocks.queryFn = vi.fn(async () => rows);
    mocks.period = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the UTC reset countdown on the day board", () => {
    renderPage();
    expect(screen.getByText("leaderboard.day-resets-in")).toBeInTheDocument();
    expect(i18next.t).toHaveBeenCalledWith("leaderboard.day-resets-in", { hours: 5, minutes: 12 });
  });

  it.each(["week", "month"])("shows no reset countdown on the %s board", (period) => {
    mocks.period = period;
    renderPage();
    expect(screen.queryByText("leaderboard.day-resets-in")).not.toBeInTheDocument();
    expect(i18next.t).not.toHaveBeenCalledWith("leaderboard.day-resets-in", expect.anything());
  });

  it("refetches the day board on mount instead of showing an earlier copy", async () => {
    mocks.queryClient!.setQueryData(QueryKeys.analytics.discoverLeaderboard("day"), []);
    renderPage();
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledWith("day"));
  });

  it("loads the new day board right at 00:00 UTC while the page is open", async () => {
    vi.setSystemTime(new Date("2026-10-30T23:59:30Z"));
    renderPage();
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(30 * 1000);
    });
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(2));
  });

  it("reloads the day board when coming back to it from another period", async () => {
    const { rerender } = renderPage();
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(1));

    mocks.period = "week";
    rerender(page());
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledWith("week"));

    mocks.period = null;
    rerender(page());
    await waitFor(() =>
      expect(vi.mocked(mocks.queryFn).mock.calls.filter(([d]) => d === "day")).toHaveLength(2)
    );
  });
});
