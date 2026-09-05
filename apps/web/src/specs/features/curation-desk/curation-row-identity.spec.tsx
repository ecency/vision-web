import React from "react";
import "@testing-library/jest-dom";
import { act, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, makeOverlay, makeRoster, makeRosterPage, makeRow, makeStatus } from "./curation-test-utils";
import type { DeskRow } from "@/features/curation-desk/types";

const seen = vi.hoisted(() => ({ rows: [] as Array<{ postId: number; row: object }> }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "curator1" }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "curator1" }, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: vi.fn(), activeUser: { username: "curator1" } }),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (cond: (c: unknown) => unknown) =>
      cond({ visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: true } } } }),
  },
}));
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const Lazy = React.lazy(async () => {
      const m = (await loader()) as Record<string, unknown>;
      const component = m && typeof m === "object" && !("$$typeof" in m) && "default" in m ? m.default : m;
      return { default: component as React.ComponentType };
    });
    return React.forwardRef(function DynamicStub(props: Record<string, unknown>, ref) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} ref={ref} />
        </React.Suspense>
      );
    });
  },
}));
vi.mock("react-virtuoso", () => ({
  Virtuoso: React.forwardRef(function VirtuosoStub(props: { data: unknown[]; itemContent: (i: number, item: unknown) => React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ scrollIntoView: vi.fn(), scrollToIndex: vi.fn() }));
    return <div>{props.data.map((item, i) => <React.Fragment key={i}>{props.itemContent(i, item)}</React.Fragment>)}</div>;
  }),
}));
// Records the row object each render receives: identity is the whole point.
vi.mock("@/features/curation-desk/curation-queue-row", () => ({
  CurationQueueRow: ({ row }: { row: DeskRow }) => {
    seen.rows.push({ postId: row.post_id, row });
    return <article aria-label={String(row.post_id)} />;
  },
}));
vi.mock("@/features/curation-desk/curation-quick-view", () => ({ CurationQuickView: () => null }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQueueView } from "@/features/curation-desk/curation-queue-view";
import { noteCuratorActivity } from "@/features/curation-desk/hooks";

function last(postId: number) {
  const hits = seen.rows.filter((r) => r.postId === postId);
  return hits[hits.length - 1]?.row;
}

describe("row identity across a tick", () => {
  let tickBody: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seen.rows.length = 0;
    noteCuratorActivity();
    tickBody = {
      overlay: [],
      deltas: { marks: [], flags: [], signals: [] },
      team_cursor: { post_id: null, created: null },
      active_curators: [],
      trail_alerts: [],
      generated_at: iso(15_000),
      truncated: false,
    };
    installFetchRouter()
      .on(/curation-desk\/status/, () => makeStatus())
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/roster-feed/, () =>
        makeRosterPage([
          makeRow({ post_id: 11, overlay: makeOverlay() }),
          makeRow({ post_id: 12, overlay: makeOverlay() }),
        ])
      )
      .on(/curation-desk\/tick/, () => tickBody);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hands an untouched row the SAME object after a delta on its neighbour", async () => {
    renderWithQueryClient(<CurationQueueView />, {
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false, staleTime: 60_000 } } }),
    });
    await waitFor(() => expect(seen.rows.filter((r) => r.postId === 11)).not.toHaveLength(0));
    const before11 = last(11);
    const before12 = last(12);
    const renders = seen.rows.length;

    tickBody = {
      ...tickBody,
      deltas: { marks: [{ post_id: 12, curator: "riyat", state: "reviewed", updated_at: iso(10_000) }], flags: [], signals: [] },
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(seen.rows.length).toBeGreaterThan(renders));

    // The merge rebuilt only the row it touched; the view passes the page
    // objects straight through, so React.memo skips the untouched row.
    expect(last(11)).toBe(before11);
    expect(last(12)).not.toBe(before12);
    expect((last(12) as DeskRow).overlay?.team_mark).toBe("reviewed");
  });
});
