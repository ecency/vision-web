import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { makeOverlay, makeRow, rowWindowProps } from "./curation-test-utils";

// The shared mock returns the key alone, which hides every interpolated value.
// These chips ARE their values, so this spec renders the params too.
vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: vi.fn((key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
    ),
    language: "en-US",
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn(),
  },
}));
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
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
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ isPending: false, mutateAsync: async () => ({}) }),
}));

import { CurationQueueRow } from "@/features/curation-desk/curation-queue-row";
import type { DeskRow } from "@/features/curation-desk/types";

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
 * One envelope exactly as the signals service emits it: whole percents,
 * `hive_hosted`, and `n` for the baseline size. It never sends `on_hive`,
 * `sample` or a 0-1 fraction, and every hop to the desk passes the object
 * through untouched, so what it writes here is what a curator reads.
 */
function signalRow(): DeskRow {
  return makeRow({
    post_id: 42,
    author: "alice",
    permlink: "morning-light",
    overlay: makeOverlay({
      signals: {
        formulaic: 1,
        images: { hive_hosted: 6, external: 0, total: 6 },
        engagement: { replies_per_day: 1.2 },
        style: { alert: true, sigma: 3.4, n: 30, driver: "para_len_mean" },
      },
    }),
  });
}

function renderRow() {
  const row = signalRow();
  return renderWithQueryClient(
    <CurationQueueRow
      row={row}
      isActive={false}
      isRoster
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

describe("curation desk signal chips read the keys the service actually sends", () => {
  it("renders a 1% score as 1%, not 100%", () => {
    const { container } = renderRow();
    // The old normaliser multiplied anything <= 1 by 100, which put the desk's
    // reddest chip on its cleanest posts: a curator's own post read "Formulaic 100%".
    expect(container.textContent).toContain('curation-desk.signals.formulaic {"pct":1}');
    expect(container.textContent).not.toContain('{"pct":100}');
  });

  it("counts Hive-hosted images from hive_hosted", () => {
    const { container } = renderRow();
    // `on_hive` has never existed in the payload, so reading it showed 0/6 on
    // every post that had images, which reads as "none of these are the author's".
    expect(container.textContent).toContain('"hive":6');
    expect(container.textContent).not.toContain('"hive":0');
  });

  it("names the baseline size from n", () => {
    const { container } = renderRow();
    expect(container.textContent).toContain('"sample":30');
    expect(container.textContent).not.toContain('"sample":""');
  });
});
