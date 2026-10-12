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
const openInNewTab = vi.fn();
vi.mock("@/utils/open-in-new-tab", () => ({ openInNewTab: (path: string) => openInNewTab(path) }));

import { WavesListItem } from "@/app/waves/_components/waves-list-item";
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
    openInNewTab.mockClear();
  });

  it("shows an ordinary wave as it is", () => {
    const { container } = render(<WavesListItem item={wave("plain")} i={0} />);
    expect(screen.getByTestId("body")).toBeInTheDocument();
    expect(covered(container)).toBeNull();
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

  it("carries the verdict to the wave page in the link, in this tab and a new one", () => {
    // The wave page reads the chain, which has no verdict. A new tab is a
    // separate realm, so nothing kept in memory would reach it.
    const { container } = render(<WavesListItem item={wave("linked", { nsfw: true })} i={0} />);
    const card = container.querySelector(".waves-list-item") as HTMLElement;
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/waves/alice/linked?sensitive=1");
    fireEvent.click(card, { ctrlKey: true });
    expect(openInNewTab).toHaveBeenCalledWith("/waves/alice/linked?sensitive=1");
  });

  it("drops the hint once the viewer has revealed the wave, or has NSFW turned on", () => {
    // Asking again on the wave page for a picture they just chose to see is noise.
    const { container } = render(<WavesListItem item={wave("seen", { nsfw: true })} i={0} />);
    fireEvent.click(screen.getByRole("button", { name: "waves.nsfw-reveal" }));
    fireEvent.click(container.querySelector(".waves-list-item") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/waves/alice/seen");

    store.nsfw = true;
    push.mockClear();
    const second = render(<WavesListItem item={wave("opted", { nsfw: true })} i={0} />);
    fireEvent.click(second.container.querySelector(".waves-list-item") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/waves/alice/opted");
  });

  it("links an ordinary wave without the hint", () => {
    const { container } = render(<WavesListItem item={wave("plain-link")} i={0} />);
    fireEvent.click(container.querySelector(".waves-list-item") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/waves/alice/plain-link");
  });
});
