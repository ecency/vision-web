import React from "react";
import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const store = { nsfw: false };
const location = { search: "" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/waves/alice/p",
  useSearchParams: () => new URLSearchParams(location.search)
}));
vi.mock("react-use/lib/useMount", () => ({ default: () => {} }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: typeof store) => unknown) => selector(store)
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { getEntryQuery: (entry: unknown) => ({ kind: "entry", entry }) }
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { kind?: string; entry?: unknown }) =>
    options?.kind === "entry" ? { data: options.entry } : { data: undefined }
}));
vi.mock("@ecency/sdk", () => ({ getPostTipsQueryOptions: () => ({ kind: "tips" }) }));
vi.mock("@/app/waves/_hooks", () => ({ useWaveImageGrid: () => {} }));
vi.mock("@/app/waves/_context", () => ({ useOptionalWavesTagFilter: () => null }));
vi.mock("@/app/waves/_components/waves-list-item-header", () => ({
  WavesListItemHeader: () => <div data-testid="header" />
}));
vi.mock("@/features/waves", () => ({ WaveActions: () => null, WaveForm: () => null }));
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

import { WaveViewDetails } from "@/app/waves/[author]/[permlink]/_components/wave-view-details";
import { WaveEntry } from "@/entities";

// What the page gets: an entry from the chain, with tags but never an `nsfw` field.
function chainWave(permlink: string, tags: string[] = ["waves"]): WaveEntry {
  return {
    author: "alice",
    permlink,
    body: "some words",
    json_metadata: { tags }
  } as unknown as WaveEntry;
}

const covered = (container: HTMLElement) => container.querySelector("[data-nsfw-covered]");

describe("the wave page and waves flagged as explicit", () => {
  beforeEach(() => {
    store.nsfw = false;
    location.search = "";
  });

  it("shows an ordinary wave as it is", () => {
    const { container } = render(<WaveViewDetails entry={chainWave("plain")} />);
    expect(screen.getByTestId("body")).toBeInTheDocument();
    expect(covered(container)).toBeNull();
  });

  it("covers a wave tagged nsfw", () => {
    const { container } = render(<WaveViewDetails entry={chainWave("tagged", ["nsfw"])} />);
    expect(covered(container)).not.toBeNull();
  });

  it("covers a wave opened from a covered card, then reveals on request", () => {
    // Clicking a covered card opens this page; without the hint on its link the
    // picture the card was hiding would be shown full size one navigation later.
    location.search = "?sensitive=1";
    const { container } = render(<WaveViewDetails entry={chainWave("from-feed")} />);
    expect(covered(container)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "waves.nsfw-reveal" }));
    expect(covered(container)).toBeNull();
  });

  it("does not cover for a viewer who turned NSFW on", () => {
    store.nsfw = true;
    location.search = "?sensitive=1";
    const { container } = render(<WaveViewDetails entry={chainWave("opted-in", ["nsfw"])} />);
    expect(covered(container)).toBeNull();
  });
});
