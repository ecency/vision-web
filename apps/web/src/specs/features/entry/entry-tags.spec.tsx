import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { EntryTags } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-tags";
import type { Entry } from "@/entities";

vi.mock("@/features/shared/tag", () => ({
  TagLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>
}));

vi.mock("@/features/shared/follow-tag-btn", () => ({
  FollowTagChipToggle: () => null
}));

// The global @/utils mock keeps only two members; the label needs isCommunity.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  getAccessToken: vi.fn(() => "mock-token")
}));

const TITLES: Record<string, string> = { "hive-125125": "Museum", "hive-999999": "Toy Makers" };
const lookups = vi.fn();

vi.mock("@/core/caches", () => ({
  getCommunityCache: (tag: string) => ({
    queryKey: ["community", tag],
    queryFn: async () => {
      lookups(tag);
      return { name: tag, title: TITLES[tag] ?? tag };
    }
  })
}));

const entry = (tags: string[], community?: { name: string; title: string }): Entry =>
  ({
    author: "melinda",
    permlink: "sunflowers",
    community: community?.name,
    community_title: community?.title,
    json_metadata: { tags }
  }) as unknown as Entry;

describe("EntryTags", () => {
  it("names the post's community by its title without a lookup, and plain tags as themselves", () => {
    lookups.mockClear();
    renderWithQueryClient(
      <EntryTags
        entry={entry(["hive-125125", "museum", "chicago"], { name: "hive-125125", title: "Museum" })}
      />
    );

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.queryByText("hive-125125")).not.toBeInTheDocument();
    expect(screen.getByText("museum")).toBeInTheDocument();
    expect(screen.getByText("chicago")).toBeInTheDocument();
    expect(lookups).not.toHaveBeenCalled();
  });

  // A community id among the tags that is not the post's own community is looked
  // up; until the answer lands the id stands in.
  it("resolves another community id in the list to its title", async () => {
    lookups.mockClear();
    renderWithQueryClient(<EntryTags entry={entry(["photography", "hive-999999"])} />);

    expect(await screen.findByText("Toy Makers")).toBeInTheDocument();
    expect(lookups).toHaveBeenCalledWith("hive-999999");
    expect(lookups).not.toHaveBeenCalledWith("photography");
  });
});
