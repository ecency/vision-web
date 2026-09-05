import React from "react";
import "@testing-library/jest-dom";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makeRow } from "./curation-test-utils";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/utils")) }));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "member1" }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => ({ activeUser: { username: "member1" }, account: null }) }));
vi.mock("@/core/global-store", () => ({ useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: vi.fn(), activeUser: { username: "member1" } }) }));
vi.mock("@/features/shared/profile-popover", () => ({ ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span> }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({ useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) }));

import { CurationQueueRow } from "@/features/curation-desk/curation-queue-row";
import { computeWindow } from "@/features/curation-desk/curation-window";
import type { DeskRow } from "@/features/curation-desk/types";

const HOUR = 3_600_000;
const noop = () => {};
const actions = { onSelect: noop, onOpen: noop, onVote: noop, onReviewed: noop, onSnooze: noop, onFlag: noop, onNote: noop, onClearMark: noop };

function renderRow(row: DeskRow) {
  return renderWithQueryClient(
    <CurationQueueRow row={row} isActive={false} isRoster={false} isTrial={false} username="member1" recommendationsEnabled section="queue" late={false} resurfaced={false} belowCursor={false} reviewedByCursor={false} chronological {...actions} />
  );
}

describe("computeWindow", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("classifies full, half, eighth, locked and paid from created and payout_at", () => {
    expect(computeWindow(at(-2 * HOUR), at(7 * 24 * HOUR), now)).toMatchObject({ kind: "full", urgent: false });
    expect(computeWindow(at(-23 * HOUR), at(7 * 24 * HOUR), now)).toMatchObject({ kind: "full", urgent: true });
    expect(computeWindow(at(-31 * HOUR), at(7 * 24 * HOUR), now)).toMatchObject({ kind: "half" });
    expect(computeWindow(at(-80 * HOUR), at(7 * 24 * HOUR), now)).toMatchObject({ kind: "eighth" });
    expect(computeWindow(at(-6.5 * 24 * HOUR), at(11 * HOUR), now)).toEqual({ kind: "locked", scalePct: 92, voteHidden: false });
    expect(computeWindow(at(-6.9 * 24 * HOUR), at(2 * HOUR), now)).toEqual({ kind: "locked", scalePct: 17, voteHidden: true });
    expect(computeWindow(at(-7 * 24 * HOUR), at(0), now)).toEqual({ kind: "paid" });
    expect(computeWindow(at(-8 * 24 * HOUR), at(-HOUR), now)).toEqual({ kind: "paid" });
  });

  it("reads chain timestamps without a zone as UTC", () => {
    expect(computeWindow("2026-09-05T10:00:00", "2026-09-12T10:00:00", now)).toMatchObject({ kind: "full" });
  });
});

describe("CurationWindowBadge on a row", () => {
  let router: ReturnType<typeof installFetchRouter>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
    router = installFetchRouter();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("flips FULL to HALF within one ticker interval with no network request", async () => {
    const created = new Date(Date.now() - (24 * HOUR - 30_000)).toISOString();
    renderRow(makeRow({ post_id: 1, created, payout_at: new Date(Date.now() + 6 * 24 * HOUR).toISOString() }));
    const badge = () => document.querySelector("[data-window]")!;
    expect(badge().getAttribute("data-window")).toBe("full");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(badge().getAttribute("data-window")).toBe("half");
    expect(router.calls).toHaveLength(0);
  });

  it("LOCKED at payout minus 11 h keeps Vote dimmed with the scale tooltip and hides Recommend", () => {
    const row = makeRow({ post_id: 2, created: new Date(Date.now() - 6.5 * 24 * HOUR).toISOString(), payout_at: new Date(Date.now() + 11 * HOUR).toISOString() });
    renderRow(row);
    expect(document.querySelector("[data-window]")!.getAttribute("data-window")).toBe("locked");
    const vote = screen.getByLabelText("curation-desk.actions.vote");
    expect(vote.className).toContain("opacity-50");
    expect(vote.getAttribute("title")).toBe("curation-desk.window.locked-tooltip");
    expect(computeWindow(row.created, row.payout_at, Date.now())).toMatchObject({ scalePct: 92 });
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
  });

  it("LOCKED at payout minus 2 h hides Vote (under the 25% floor)", () => {
    renderRow(makeRow({ post_id: 3, created: new Date(Date.now() - 6.9 * 24 * HOUR).toISOString(), payout_at: new Date(Date.now() + 2 * HOUR).toISOString() }));
    expect(screen.queryByLabelText("curation-desk.actions.vote")).toBeNull();
  });

  it("renders PAID when payout_at is not after now", () => {
    renderRow(makeRow({ post_id: 4, created: new Date(Date.now() - 7 * 24 * HOUR).toISOString(), payout_at: new Date(Date.now()).toISOString() }));
    expect(document.querySelector("[data-window]")!.getAttribute("data-window")).toBe("paid");
  });
});
