import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, jsonResponse, makeOverlay, makePost, makeRoster, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: undefined as string | undefined,
  toggleUiProp: vi.fn(),
  ops: [] as unknown[],
  result: (() => Promise.resolve<unknown>({ tx_id: "a".repeat(40) })) as () => Promise<unknown>,
}));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: state.username ? { username: state.username } : null, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: state.toggleUiProp, activeUser: state.username ? { username: state.username } : null }),
}));
vi.mock("@/features/shared/profile-popover", () => ({ ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span> }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@ui/modal", () => ({
  Modal: ({ show, children }: { show: boolean; children: React.ReactNode }) => (show ? <div role="dialog">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The web wrapper is replaced by a fake that still runs the REAL op builders, so
// the spec sees the custom_json the SDK would broadcast and controls the result.
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", async () => {
  const sdk = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    useCurationRecommendMutation: () => ({
      isPending: false,
      mutateAsync: async (p: { author: string; permlink: string; reason?: "quality" | "underrated" | "newcomer" | "other"; withdraw?: boolean }) => {
        const op = p.withdraw
          ? sdk.buildCurationUnrecommendOp(state.username!, p.author, p.permlink)
          : sdk.buildCurationRecommendOp(state.username!, p.author, p.permlink, p.reason);
        state.ops.push(op);
        return state.result();
      },
    }),
  };
});

import { CurationQueueRow } from "@/features/curation-desk/curation-queue-row";
import { resetRecommendFlowForTests } from "@/features/curation-desk/curation-recommend-flow";
import { resetRecommendStoreForTests } from "@/features/curation-desk/curation-recommend-store";
import type { DeskRow } from "@/features/curation-desk/types";

const noop = () => {};
const actions = { onSelect: noop, onOpen: noop, onVote: noop, onReviewed: noop, onSnooze: noop, onFlag: noop, onNote: noop, onClearMark: noop };

function renderRow(row: DeskRow, isRoster = false) {
  return renderWithQueryClient(
    <CurationQueueRow
      row={row}
      isActive={false}
      isRoster={isRoster}
      isTrial={false}
      username={state.username}
      recommendationsEnabled
      section="queue"
      late={false}
      resurfaced={false}
      belowCursor={false}
      reviewedByCursor={false}
      chronological
      {...actions}
    />
  );
}

// Synchronous queries only: findBy* polls with setTimeout, which the fake
// timers in the later tests never advance.
async function recommend() {
  await act(async () => {
    fireEvent.click(screen.getByLabelText("curation-desk.recommend.aria"));
  });
  await act(async () => {
    fireEvent.click(screen.getByLabelText("curation-desk.recommend.confirm"));
  });
}

describe("curation desk access matrix", () => {
  let router: ReturnType<typeof installFetchRouter>;
  const row = makeRow({ post_id: 1, author: "alice", permlink: "morning-light" });
  const TX = "b".repeat(40);

  beforeEach(() => {
    state.username = undefined;
    state.toggleUiProp.mockReset();
    state.ops.length = 0;
    state.result = () => Promise.resolve({ tx_id: TX });
    resetRecommendFlowForTests();
    resetRecommendStoreForTests();
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/recommend-meta$/, () => jsonResponse({ ok: true }, 202))
      .on(/curation-desk\/post\//, () => makePost(row));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("anon sees the row and gets the login prompt on Recommend", async () => {
    renderRow(row);
    expect(screen.getByRole("article")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("curation-desk.recommend.aria"));
    expect(state.toggleUiProp).toHaveBeenCalledWith("login");
    expect(state.ops).toHaveLength(0);
    // No roster-only actions for anonymous viewers.
    expect(screen.queryByLabelText("curation-desk.actions.reviewed")).toBeNull();
  });

  it("member's recommend click builds the ecency_curation custom_json with posting authority only", async () => {
    state.username = "member1";
    renderRow(row);
    await recommend();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(state.ops).toHaveLength(1);
    const [type, payload] = state.ops[0] as [string, { id: string; required_auths: string[]; required_posting_auths: string[]; json: string }];
    expect(type).toBe("custom_json");
    expect(payload.id).toBe("ecency_curation");
    expect(payload.required_auths).toEqual([]);
    expect(payload.required_posting_auths).toEqual(["member1"]);
    expect(JSON.parse(payload.json)).toEqual({ v: 1, op: "recommend", author: "alice", permlink: "morning-light", reason: "quality" });
  });

  it.each([
    ["BroadcastResult", () => Promise.resolve({ tx_id: "c".repeat(40), status: "unknown" }), "c".repeat(40)],
    ["TransactionConfirmation", () => Promise.resolve({ id: "d".repeat(40), block_num: 1, trx_num: 0, expired: false }), "d".repeat(40)],
  ])("sends the meta ping with the 40 char id from a %s", async (_name, result, expected) => {
    state.username = "member1";
    state.result = result as () => Promise<unknown>;
    renderRow(row);
    await recommend();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const pings = router.callsTo(/recommend-meta$/);
    expect(pings).toHaveLength(1);
    expect(pings[0].body).toMatchObject({ author: "alice", permlink: "morning-light", trx_id: expected, ua_class: "web", code: "code-1" });
  });

  it("with a never-resolving broadcast the ping fires from the first route 5 poll that lists the viewer, without trx_id", async () => {
    vi.useFakeTimers();
    state.username = "member1";
    state.result = () => new Promise<unknown>(() => {});
    router.on(/curation-desk\/post\//, () =>
      makePost(row, { recommend_count: 1, recommenders: [{ username: "member1", rep: 55, reason: "quality", at: "2026-09-05T12:00:03Z", has_meta: false }] })
    );
    renderRow(row);
    await recommend();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900);
    });
    expect(router.callsTo(/recommend-meta$/)).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    const pings = router.callsTo(/recommend-meta$/);
    expect(pings).toHaveLength(1);
    expect(pings[0].body).not.toHaveProperty("trx_id");
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(1);
  });

  it("retries a 429 on the first ping after 2 s", async () => {
    vi.useFakeTimers();
    state.username = "member1";
    let attempts = 0;
    router.on(/curation-desk\/recommend-meta$/, () => (++attempts === 1 ? jsonResponse({ error: "slow" }, 429) : jsonResponse({ ok: true }, 202)));
    renderRow(row);
    await recommend();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(router.callsTo(/recommend-meta$/)).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(router.callsTo(/recommend-meta$/)).toHaveLength(2);
  });

  it("a meta failure after the retries leaves the recommendation successful", async () => {
    vi.useFakeTimers();
    state.username = "member1";
    router.on(/curation-desk\/recommend-meta$/, () => jsonResponse({ error: "down" }, 500));
    renderRow(row);
    await recommend();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000 + 10_000 + 30_000 + 1_000);
    });
    expect(router.callsTo(/recommend-meta$/)).toHaveLength(4);
    expect(screen.getByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
  });

  it("hides Recommend on the viewer's own post", () => {
    state.username = "alice";
    renderRow(row);
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
    expect(screen.queryByLabelText("curation-desk.recommend.withdraw-aria")).toBeNull();
  });

  it("roster sees marks and the roster actions", () => {
    state.username = "curator1";
    const marked = makeRow({
      post_id: 3,
      overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "riyat", marks: [{ curator: "riyat", state: "reviewed", updated_at: "2026-09-05T11:58:00Z" }] }),
    });
    renderRow(marked, true);
    expect(screen.getByText("curation-desk.marks.reviewed-by")).toBeInTheDocument();
    expect(screen.getByLabelText("curation-desk.actions.snooze")).toBeInTheDocument();
    expect(screen.getByLabelText("curation-desk.actions.flag")).toBeInTheDocument();
    expect(screen.getByLabelText("curation-desk.actions.clear-mark")).toBeInTheDocument();
  });
});
