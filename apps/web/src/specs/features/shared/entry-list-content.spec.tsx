import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const VIEWER = "viewer";

// `@/utils` is globally mocked down to two functions; the no-data placeholder
// needs the real `isCommunity`.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// The mute list is a real query in production. Point the builder at the real key
// so seeding the cache below cannot drift from what the component reads, and
// disable it so the spec never reaches the network.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getMutedUsersQueryOptions: vi.fn((username?: string) => ({
    queryKey: QueryKeys.accounts.mutedUsers(username!),
    queryFn: async () => [] as string[],
    enabled: false
  }))
}));

// The card itself is covered by entry-list-item.spec; here we only care about
// which entries the list decides to render.
vi.mock("@/features/shared", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/features/shared")),
  EntryListItem: ({ entry }: { entry: Entry }) => <div data-testid="entry">{entry.title}</div>
}));

import { EntryListContent } from "@/features/shared/entry-list-content";

function renderList(
  entries: Entry[],
  mutedAuthors?: string[],
  promotedEntries: Entry[] = [],
  props: { showEmptyPlaceholder?: boolean } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (mutedAuthors) {
    queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryListContent
        entries={entries}
        promotedEntries={promotedEntries}
        isPromoted={promotedEntries.length > 0}
        sectionParam="hot"
        username={VIEWER}
        loading={false}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("EntryListContent", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: VIEWER } as any,
      username: VIEWER,
      account: null,
      isLoading: false,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it("renders every entry when the viewer has muted nobody", () => {
    renderList([
      mockEntry({ author: "alice", permlink: "a", title: "Alice Post" }),
      mockEntry({ author: "spammer", permlink: "b", title: "Spammer Post" })
    ]);

    expect(screen.getAllByTestId("entry")).toHaveLength(2);
  });

  it("drops entries whose author the viewer muted", () => {
    renderList(
      [
        mockEntry({ author: "alice", permlink: "a", title: "Alice Post" }),
        mockEntry({ author: "spammer", permlink: "b", title: "Spammer Post" })
      ],
      ["spammer"]
    );

    expect(screen.getByText("Alice Post")).toBeInTheDocument();
    expect(screen.queryByText("Spammer Post")).not.toBeInTheDocument();
  });

  it("shows the no-data state when it owns the list and every entry is muted", () => {
    const { container } = renderList(
      [mockEntry({ author: "spammer", permlink: "b", title: "Spammer Post" })],
      ["spammer"]
    );

    expect(screen.queryByTestId("entry")).not.toBeInTheDocument();
    expect(container.textContent).not.toBe("");
  });

  it("stays quiet when it is only a slice, so it cannot answer for later pages", () => {
    // showEmptyPlaceholder={false} is how a caller says a sibling owns the total.
    const { container } = renderList(
      [mockEntry({ author: "spammer", permlink: "b", title: "Spammer Post" })],
      ["spammer"],
      [],
      { showEmptyPlaceholder: false }
    );

    expect(screen.queryByTestId("entry")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("drops muted authors from interleaved promoted entries too", () => {
    renderList(
      [
        mockEntry({ author: "alice", permlink: "a1", title: "A1" }),
        mockEntry({ author: "alice", permlink: "a2", title: "A2" }),
        mockEntry({ author: "alice", permlink: "a3", title: "A3" }),
        mockEntry({ author: "alice", permlink: "a4", title: "A4" }),
        mockEntry({ author: "alice", permlink: "a5", title: "A5" })
      ],
      ["promoter"],
      [mockEntry({ author: "promoter", permlink: "p1", title: "Promoted Post" })]
    );

    expect(screen.queryByText("Promoted Post")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("entry")).toHaveLength(5);
  });
});
