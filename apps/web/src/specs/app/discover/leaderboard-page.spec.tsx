import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/app/discover/_components/day-reset-label", () => ({
  DayResetLabel: ({ onDayChange }: { onDayChange?: () => void }) => (
    <button data-testid="day-reset-label" aria-label="day changed" onClick={() => onDayChange?.()} />
  )
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

function renderPage() {
  return render(
    <QueryClientProvider client={mocks.queryClient!}>
      <LeaderboardPage searchParams={Promise.resolve({})} />
    </QueryClientProvider>
  );
}

describe("Leaderboard page, UTC day reset", () => {
  beforeEach(() => {
    // the app's client never refetches fresh data on mount by default
    mocks.queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } }
    });
    mocks.queryFn = vi.fn(async () => rows);
    mocks.period = null;
  });

  it("shows the UTC reset label on the day board", () => {
    renderPage();
    expect(screen.getByTestId("day-reset-label")).toBeInTheDocument();
  });

  it.each(["week", "month"])("shows no reset label on the %s board", (period) => {
    mocks.period = period;
    renderPage();
    expect(screen.queryByTestId("day-reset-label")).not.toBeInTheDocument();
  });

  it("refetches the day board on mount instead of showing an earlier copy", async () => {
    mocks.queryClient!.setQueryData(QueryKeys.analytics.discoverLeaderboard("day"), []);
    renderPage();
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledWith("day"));
  });

  it("loads the new day board when the UTC day changes while the page is open", async () => {
    renderPage();
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("day-reset-label"));
    await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(2));
  });
});
