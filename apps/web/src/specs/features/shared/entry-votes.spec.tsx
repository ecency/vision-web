import { vi } from "vitest";
import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";
import { EntryVotes } from "@/features/shared/entry-votes";

// The component reads its entry through EcencyEntriesCacheManagement.getEntryQuery,
// which builds query options from the SDK's getPostQueryOptions (not provided by
// the global @ecency/sdk mock). Stub the cache helper to a plain query whose
// `initialData` is the passed entry, so the prop renders synchronously and the
// component's count/tooltip logic is exercised deterministically (no network).
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQuery: (initialEntry: any) => ({
      queryKey: ["entry", initialEntry?.author, initialEntry?.permlink],
      queryFn: () => initialEntry,
      initialData: initialEntry,
      enabled: !!initialEntry
    })
  }
}));

// The dynamically-imported voters dialog pulls in the modal + SDK vote queries.
// We don't exercise it here (these tests focus on the inline count/tooltip), so
// stub it to a marker element to keep rendering deterministic and lightweight.
vi.mock("@/features/shared/entry-votes/entry-votes-dialog", () => ({
  EntryVotesDialog: ({ totalVotes }: { totalVotes: number }) => (
    <div data-testid="votes-dialog">dialog:{totalVotes}</div>
  )
}));

describe("EntryVotes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // The component reads its entry from a React Query whose `initialData` is the
  // passed-in entry, so the prop value renders synchronously without any network.
  function renderVotes(entry: ReturnType<typeof mockEntry>) {
    return renderWithQueryClient(<EntryVotes entry={entry} />);
  }

  it("renders the total vote count from stats.total_votes", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 42 }
    });
    const { container } = renderVotes(entry);

    expect(container.querySelector(".entry-votes__count")).toHaveTextContent("42");
  });

  // Deliberate raw v1 row (voter list, no stats): exercises the legacy count
  // fallback. v2 entries carry no active_votes.
  it("falls back to active_votes length when stats.total_votes is absent", () => {
    const entry = mockEntry({
      stats: undefined as any,
      active_votes: [
        { voter: "alice", rshares: 100 },
        { voter: "bob", rshares: 200 },
        { voter: "carol", rshares: 300 }
      ] as any
    });
    const { container } = renderVotes(entry);

    expect(container.querySelector(".entry-votes__count")).toHaveTextContent("3");
  });

  it("shows the empty zero-state (non-interactive, no-data) when there are no votes", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 0 }
    });
    const { container } = renderVotes(entry);

    // Count is zero
    expect(container.querySelector(".entry-votes__count")).toHaveTextContent("0");
    // Zero-state uses the "no-data" span and is NOT a clickable button.
    expect(container.querySelector(".inner-btn.no-data")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // Tooltip exposes the empty-title key (i18next is mocked to echo keys).
    expect(screen.getByLabelText("entry-votes.title-empty")).toBeInTheDocument();
  });

  it("uses the singular title for exactly one vote", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 1 }
    });
    renderVotes(entry);

    // Singular key, and it's interactive (a button) when there are votes.
    const btn = screen.getByLabelText("entry-votes.title");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("role", "button");
  });

  it("uses the pluralized title key for more than one vote", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 5 }
    });
    renderVotes(entry);

    // Plural key path (title-n) is selected for n > 1.
    expect(screen.getByLabelText("entry-votes.title-n")).toBeInTheDocument();
  });

  it("opens the voters dialog when the interactive count is clicked", async () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 7 }
    });
    renderVotes(entry);

    expect(screen.queryByTestId("votes-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    // The dialog is loaded via next/dynamic (ssr:false), so it resolves on a
    // microtask after the click toggles `visible`.
    const dialog = await screen.findByTestId("votes-dialog");
    expect(dialog).toBeInTheDocument();
    // The dialog receives the same total vote count.
    expect(dialog).toHaveTextContent("dialog:7");
  });

  it("hides the count visually (aria-hidden + hidden modifier class) when hideCount is set", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 9 }
    });
    const { container } = renderWithQueryClient(<EntryVotes entry={entry} hideCount={true} />);

    const count = container.querySelector(".entry-votes__count");
    expect(count).toHaveClass("entry-votes__count--hidden");
    expect(count).toHaveAttribute("aria-hidden", "true");
    // The numeric value is still present in the DOM, just hidden.
    expect(count).toHaveTextContent("9");
  });

  it("renders a custom icon when provided instead of the default heart", () => {
    const entry = mockEntry({
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 2 }
    });
    renderWithQueryClient(
      <EntryVotes entry={entry} icon={<span data-testid="custom-icon">x</span>} />
    );

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
