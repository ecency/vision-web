import React from "react";
import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { iso, makeOverlay, makeRow, makeStatus, rowWindowProps } from "./curation-test-utils";

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
    // The header's two public chain reads are not what this spec is about,
    // and a node call from jsdom is not either.
    getAccountFullQueryOptions: (username: string) => ({
      queryKey: ["get-account-full", username],
      queryFn: async () => null,
      enabled: false,
    }),
    getDynamicPropsQueryOptions: () => ({
      queryKey: ["dynamic-props"],
      queryFn: async () => null,
      enabled: false,
    }),
  };
});
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "member1" }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "member1" }, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleUiProp: vi.fn(), activeUser: { username: "member1" } }),
}));
vi.mock("@/features/shared/profile-popover", () => ({
  ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span>,
}));
vi.mock("@/features/shared/user-avatar", () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-username={username} />,
}));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
// The row's recommend control is not what this spec reads; the real wrapper
// would reach the broadcast adapter for it.
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ isPending: false, mutateAsync: async () => ({}) }),
}));

import { CurationHeader } from "@/features/curation-desk/curation-header";
import { CurationQueueRow } from "@/features/curation-desk/curation-queue-row";
import type { DeskRow } from "@/features/curation-desk/types";

const CURATOR = "nightowl";

const noop = () => {};
const actions = {
  onSelect: noop,
  onOpen: noop,
  onVote: noop,
  onReviewed: noop,
  onSnooze: noop,
  onFlag: noop,
  onNote: noop,
  onClearMark: noop,
};

/**
 * Marks, signals and flags a roster feed would ship. A public feed ships none
 * of it, so a row carrying it is the strongest form of the question: does the
 * public render leak per-curator activity when the data is right there?
 */
function loadedRow(): DeskRow {
  return makeRow({
    post_id: 42,
    author: "alice",
    permlink: "morning-light",
    overlay: makeOverlay({
      team_mark: "flagged",
      team_mark_by: CURATOR,
      flags: { abuser: true },
      excluded_reason: "rep_low",
      notes_count: 3,
      signals: { formulaic: 62 },
      marks: [
        { curator: CURATOR, state: "flagged", reason: "plagiarism", updated_at: iso(-60_000) },
        { curator: CURATOR, state: "reviewed", updated_at: iso(-120_000) },
        { curator: CURATOR, state: "snoozed", snooze_until: iso(3_600_000), updated_at: iso(-180_000) },
      ],
    }),
  });
}

function renderRow(isRoster: boolean) {
  const row = loadedRow();
  return renderWithQueryClient(
    <CurationQueueRow
      row={row}
      isActive={false}
      isRoster={isRoster}
      isTrial={false}
      username="member1"
      recommendationsEnabled
      coarsePointer={false}
      section="queue"
      late={false}
      resurfaced={false}
      belowCursor={false}
      reviewedByCursor
      chronological
      {...rowWindowProps(row)}
      {...actions}
    />
  );
}

function renderHeader(isRoster: boolean) {
  return renderWithQueryClient(
    <CurationHeader
      status={makeStatus()}
      activeCurators={[{ username: CURATOR, last_action_at: iso(-60_000) }]}
      isRoster={isRoster}
      livePaused={false}
      onHelp={noop}
    />
  );
}

/**
 * Spec 8.8: speed metrics are roster-only, permanently. The public sees
 * coverage, the curated view and the curated-today count; it never sees who
 * reviewed, snoozed or flagged anything, who is active or who moved the
 * cursor. The backend omits the fields; this pins the web side of the same
 * rule, so a payload that ever carried them still renders nothing.
 */
describe("public curation desk renders no per-curator activity", () => {
  const PER_CURATOR_KEYS = [
    "curation-desk.marks.reviewed-by",
    "curation-desk.marks.reviewed-by-cursor",
    "curation-desk.marks.snoozed-until",
    "curation-desk.marks.flagged",
    "curation-desk.flag-reasons.plagiarism",
    "curation-desk.marks.abuse-list",
    "curation-desk.marks.excluded",
    "curation-desk.excluded-reasons.rep_low",
    "curation-desk.signals.formulaic",
    "curation-desk.signals.na",
  ];

  it("shows no mark, signal, flag or curator name on a public row", () => {
    const { container } = renderRow(false);
    for (const key of PER_CURATOR_KEYS) {
      expect(screen.queryByText(key)).toBeNull();
    }
    expect(container.textContent).not.toContain(CURATOR);
    // The author is the only name a public row carries.
    expect(container.querySelector(`[data-username="${CURATOR}"]`)).toBeNull();
    expect(container.querySelector('[data-username="alice"]')).not.toBeNull();
  });

  it("still shows all of it to the roster, so the assertions above are live", () => {
    const { container } = renderRow(true);
    expect(screen.getAllByText("curation-desk.flag-reasons.plagiarism", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("curation-desk.signals.formulaic").length).toBeGreaterThan(0);
    // The roster row carries it twice: on the author line and in the badges.
    expect(screen.getAllByText("curation-desk.marks.abuse-list").length).toBeGreaterThan(0);
    expect(container.textContent).toContain(CURATOR);
  });

  it("shows no active curators in the public header", () => {
    const { container } = renderHeader(false);
    expect(screen.queryByText("curation-desk.header.active")).toBeNull();
    expect(screen.queryByText("curation-desk.header.active-none")).toBeNull();
    expect(screen.queryByText("curation-desk.header.active-hint")).toBeNull();
    expect(container.querySelector(`[data-username="${CURATOR}"]`)).toBeNull();
    // The curated-today count stays public.
    expect(screen.getByText("curation-desk.header.curated-today")).toBeInTheDocument();
  });

  it("shows the active curators to the roster, so the assertions above are live", () => {
    const { container } = renderHeader(true);
    expect(screen.getByText("curation-desk.header.active")).toBeInTheDocument();
    expect(container.querySelector(`[data-username="${CURATOR}"]`)).not.toBeNull();
  });
});
