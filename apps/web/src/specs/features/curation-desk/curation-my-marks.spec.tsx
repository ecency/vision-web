import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurationMarkState, CurationMyMarksResponse } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, makeRoster } from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: "curator1" as string | undefined }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
  getAccessToken: vi.fn(() => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({
    activeUser: state.username ? { username: state.username } : null,
    account: null,
    isLoading: false,
  }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleUiProp: vi.fn(), activeUser: state.username ? { username: state.username } : null }),
}));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));

import { CurationMyMarksView } from "@/features/curation-desk/curation-my-marks-view";

function marksPage(ids: number[], next_cursor: string | null, mark: CurationMarkState = "snoozed"): CurationMyMarksResponse {
  return {
    items: ids.map((id) => ({
      post_id: id,
      author: `author${id}`,
      permlink: `post-${id}`,
      title: `Mark ${id}`,
      created: iso(-3_600_000),
      curator: "curator1",
      state: mark,
      updated_at: iso(-60_000),
      snooze_until: iso(3_600_000),
    })),
    next_cursor,
  };
}

/**
 * The marks list is keyset paginated: the route answers a cursor while more
 * records remain, so everything past the page size stays reachable.
 */
describe("CurationMyMarksView", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    state.username = "curator1";
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster(["curator1"]))
      .on(/curation-desk\/marks$/, (_url, init) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        return body.cursor === "m2" ? marksPage([3, 4], null) : marksPage([1, 2], "m2");
      });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("appends the next page on Load more and drops the control at the end", async () => {
    renderWithQueryClient(<CurationMyMarksView />);

    expect(await screen.findByText("Mark 1")).toBeInTheDocument();
    expect(screen.getByText("Mark 2")).toBeInTheDocument();
    // Records past the first page exist, so the control is offered.
    const loadMore = await screen.findByText("g.load-more");

    fireEvent.click(loadMore);

    expect(await screen.findByText("Mark 3")).toBeInTheDocument();
    // Appended, not replaced.
    expect(screen.getByText("Mark 1")).toBeInTheDocument();
    expect(screen.getByText("Mark 4")).toBeInTheDocument();
    // The last page answers no cursor, so there is nothing left to ask for.
    await waitFor(() => expect(screen.queryByText("g.load-more")).toBeNull());
  });

  it("carries the cursor and a fresh code on the second page", async () => {
    renderWithQueryClient(<CurationMyMarksView />);

    fireEvent.click(await screen.findByText("g.load-more"));
    await screen.findByText("Mark 3");

    const calls = router.callsTo(/curation-desk\/marks$/);
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toMatchObject({ state: "snoozed", limit: 50, code: "code-1" });
    expect(calls[0].body).not.toHaveProperty("cursor");
    expect(calls[1].body).toMatchObject({ state: "snoozed", limit: 50, cursor: "m2", code: "code-1" });
  });

  it("starts a fresh list for another mark state", async () => {
    renderWithQueryClient(<CurationMyMarksView />);
    await screen.findByText("Mark 1");

    fireEvent.click(screen.getByRole("tab", { name: "curation-desk.mark-states.flagged" }));

    await waitFor(() => expect(router.callsTo(/curation-desk\/marks$/)).toHaveLength(2));
    const calls = router.callsTo(/curation-desk\/marks$/);
    expect(calls[1].body).toMatchObject({ state: "flagged" });
    expect(calls[1].body).not.toHaveProperty("cursor");
  });
});
