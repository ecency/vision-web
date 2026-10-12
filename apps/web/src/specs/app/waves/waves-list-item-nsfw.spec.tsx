import React from "react";
import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// The card under test is real; everything it only arranges around the body is
// stubbed, so the assertions are about one thing: is the body behind the cover.
const push = vi.fn();
const store = { nsfw: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/waves"
}));
vi.mock("react-in-viewport", () => ({ useInViewport: () => ({ inViewport: false }) }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => ({ activeUser: null }) }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: typeof store) => unknown) => selector(store)
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { getEntryQuery: (entry: unknown) => ({ kind: "entry", entry }) }
}));
vi.mock("@tanstack/react-query", () => ({
  // The cached entry stands in for a chain refetch: same wave, no `nsfw` field.
  useQuery: (options: { kind?: string; entry?: Record<string, unknown> }) => {
    if (options?.kind !== "entry") return { data: undefined };
    const { nsfw: _dropped, ...chainEntry } = options.entry ?? {};
    return { data: chainEntry };
  }
}));
vi.mock("@ecency/sdk", () => ({
  getPromotedPostsQuery: () => ({ kind: "promoted" }),
  isHiddenPost: () => false
}));
vi.mock("@/api/mutations", () => ({ useCollectPageViewEvent: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/app/waves/_hooks", () => ({
  useMutedUsers: () => ({ data: [] }),
  useWaveImageGrid: () => {}
}));
vi.mock("@/app/waves/_context", () => ({ useOptionalWavesTagFilter: () => null }));
vi.mock("@/app/waves/_components/waves-list-item-header", () => ({
  WavesListItemHeader: () => <div data-testid="header" />
}));
vi.mock("@/features/waves", () => ({
  WaveActions: () => <div data-testid="actions" />,
  WaveForm: () => null
}));
vi.mock("@/features/polls", () => ({ PollWidget: () => null, useEntryPollExtractor: () => undefined }));
vi.mock("@/features/shared", () => ({
  PostContentRenderer: ({ value }: { value: string }) => (
    <div data-testid="body">
      <p>{value}</p>
      <img src="https://images.test/a.png" alt="" />
    </div>
  )
}));
vi.mock("@ui/modal", () => ({ Modal: () => null, ModalHeader: () => null }));

import { WavesListItem } from "@/app/waves/_components/waves-list-item";
import { isRememberedNsfwWave } from "@/app/waves/_utils/wave-nsfw";
import { WaveEntry } from "@/entities";

function wave(permlink: string, over: Record<string, unknown> = {}): WaveEntry {
  return {
    author: "alice",
    permlink,
    body: "some words",
    json_metadata: { tags: ["waves"] },
    ...over
  } as unknown as WaveEntry;
}

const covered = (container: HTMLElement) => container.querySelector("[data-nsfw-covered]");

describe("WavesListItem and waves flagged as explicit", () => {
  beforeEach(() => {
    store.nsfw = false;
    push.mockClear();
  });

  it("shows an ordinary wave as it is", () => {
    const { container } = render(<WavesListItem item={wave("plain")} i={0} />);
    expect(screen.getByTestId("body")).toBeInTheDocument();
    expect(covered(container)).toBeNull();
    expect(isRememberedNsfwWave("alice", "plain")).toBe(false);
  });

  it("covers a wave the API flagged, even after a chain refetch dropped the flag", () => {
    const { container } = render(<WavesListItem item={wave("flagged", { nsfw: true })} i={0} />);
    expect(covered(container)).not.toBeNull();
    expect(covered(container)!.querySelector("img")).not.toBeNull();
    expect(screen.getByText("some words")).toBeInTheDocument();
  });

  it("covers a wave its author tagged nsfw", () => {
    const { container } = render(
      <WavesListItem item={wave("tagged", { json_metadata: { tags: ["nsfw"] } })} i={0} />
    );
    expect(covered(container)).not.toBeNull();
  });

  it("uncovers on the reveal button and does not open the wave", () => {
    const { container } = render(<WavesListItem item={wave("reveal", { nsfw: true })} i={0} />);
    fireEvent.click(screen.getByRole("button", { name: "waves.nsfw-reveal" }));
    expect(covered(container)).toBeNull();
    expect(screen.getByTestId("body")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not second-guess a viewer who turned NSFW on", () => {
    store.nsfw = true;
    const { container } = render(<WavesListItem item={wave("opted-in", { nsfw: true })} i={0} />);
    expect(covered(container)).toBeNull();
  });

  it("remembers a flagged wave so its own page can cover it too", () => {
    render(<WavesListItem item={wave("remembered", { nsfw: true })} i={0} />);
    expect(isRememberedNsfwWave("alice", "remembered")).toBe(true);
  });
});
