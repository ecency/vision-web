import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Shared, hoisted state the mocks below read at render time.
const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  accounts: vi.fn(),
  topics: vi.fn(),
  communities: vi.fn(),
  terms: { account: [] as string[], topics: [] as string[], communities: [] as string[] }
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params
}));

// The global spec setup mocks @ecency/sdk without these options. `enabled`
// mirrors the real factories - it is the whole subject of these tests. Note
// getCommunitiesQueryOptions defaults it to true and takes it as the 5th
// argument, so the panel has to pass it explicitly.
vi.mock("@ecency/sdk", async () => ({
  getSearchAccountQueryOptions: (q: string, limit = 5) => {
    mocks.terms.account.push(q);
    return {
      queryKey: ["search", "account", q, limit],
      queryFn: () => mocks.accounts(),
      enabled: !!q.trim()
    };
  },
  getSearchTopicsQueryOptions: (q: string, limit = 10) => {
    mocks.terms.topics.push(q);
    return {
      queryKey: ["search", "topics", q, limit],
      queryFn: () => mocks.topics(),
      enabled: !!q.trim()
    };
  },
  getCommunitiesQueryOptions: (
    sort: string,
    q?: string,
    limit = 100,
    observer: string | undefined = undefined,
    enabled = true
  ) => {
    mocks.terms.communities.push(q ?? "");
    return {
      queryKey: ["communities", "list", sort, q ?? "", limit],
      queryFn: () => mocks.communities(),
      enabled
    };
  },
  // These panels parse the URL's q with SearchQuery, which now lives in the SDK
  // rather than @/utils. It is pure logic, so hand back the real thing.
  ...(await import("../../../../../../packages/sdk/src/modules/search/query-builder"))
}));

vi.mock("@/features/shared", () => ({
  LinearProgress: () => <div role="progressbar" />,
  ProfileLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  UserAvatar: () => null
}));

vi.mock("@/features/pro", () => ({
  ProBadge: () => null
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

// The global @/utils mock exposes only random + getAccessToken; these panels
// format and link with the real helpers.
vi.mock("@/utils", async () => ({
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ...(await vi.importActual<typeof import("@/utils/truncate")>("@/utils/truncate")),
  ...(await vi.importActual<typeof import("@/utils/make-path")>("@/utils/make-path")),
  ...(await vi.importActual<typeof import("@/utils/formatted-number")>("@/utils/formatted-number"))
}));

import { SearchPeople } from "@/app/search/_components/search-people";
import { SearchCommunities } from "@/app/search/_components/search-communities";
import { SearchTopics } from "@/app/search/_components/search-topics";

const NO_MATCHES = "g.no-matches"; // i18next is mocked to return the key
const ERROR_FAILED = "search-comment.error-failed";

function renderPanel(panel: React.ReactElement, search: string) {
  mocks.params = new URLSearchParams(search);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{panel}</QueryClientProvider>);
}

describe("search side panels", () => {
  beforeEach(() => {
    mocks.accounts.mockReset();
    mocks.topics.mockReset();
    mocks.communities.mockReset();
    mocks.terms = { account: [], topics: [], communities: [] };
  });

  // Finding 12: a filter-only query ("all posts by @demo") leaves these panels
  // with nothing to look up. Their queries are then disabled, so isLoading is
  // false and data is undefined - the arm that used to be `data?.length === 0`
  // matched neither, and the panel painted as an empty bordered box with just
  // its heading.
  describe("with no term to look up (finding 12)", () => {
    const disabledPanels: [string, React.ReactElement, string][] = [
      ["people", <SearchPeople key="people" />, "search-people.title"],
      ["topics", <SearchTopics key="topics" />, "search-topics.title"]
    ];

    it.each(disabledPanels)(
      "%s renders the empty state, not an empty box",
      (_name, panel, title) => {
        renderPanel(panel, "q=author%3Ademo");

        expect(screen.getByText(title)).toBeInTheDocument();
        expect(screen.getByText(NO_MATCHES)).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      }
    );

    it("does not request anything at all", () => {
      renderPanel(<SearchPeople />, "q=author%3Ademo+tag%3Atravel");
      renderPanel(<SearchTopics />, "q=author%3Ademo+tag%3Atravel");
      renderPanel(<SearchCommunities />, "q=author%3Ademo+tag%3Atravel");

      expect(mocks.terms.account.at(-1)).toBe("");
      expect(mocks.terms.topics.at(-1)).toBe("");
      expect(mocks.accounts).not.toHaveBeenCalled();
      expect(mocks.topics).not.toHaveBeenCalled();
      // Communities defaults to enabled and lists the global top 4 by rank
      // without a term, which a filter-only search would present as matches.
      expect(mocks.communities).not.toHaveBeenCalled();
    });
  });

  describe("when a lookup fails", () => {
    it.each([
      ["people", <SearchPeople key="p" />, "accounts" as const],
      ["topics", <SearchTopics key="t" />, "topics" as const],
      ["communities", <SearchCommunities key="c" />, "communities" as const]
    ])("%s says so instead of claiming no matches", async (_name, panel, mockName) => {
      // A rejected query leaves data undefined with isLoading false, the same
      // shape as an empty result. Telling a user no account matches "alice"
      // when the lookup never returned is the failure/empty conflation the
      // results list just lost.
      mocks[mockName].mockRejectedValue(new Error("Failed to fetch"));

      renderPanel(panel, "q=alice");

      expect(await screen.findByText(ERROR_FAILED)).toBeInTheDocument();
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });

  describe("with a term", () => {
    it("looks people up by the free text, lowercased and without the @", async () => {
      mocks.accounts.mockResolvedValue([
        { name: "alice", metadata: { profile: { name: "Alice", about: "Photographer" } } }
      ]);

      renderPanel(<SearchPeople />, "q=%40Alice+author%3Ademo");

      expect(await screen.findByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Photographer")).toBeInTheDocument();
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
      expect(mocks.terms.account.at(-1)).toBe("alice");
    });

    it("keeps the spinner up while the lookup is in flight", async () => {
      mocks.topics.mockReturnValue(new Promise(() => {}));

      renderPanel(<SearchTopics />, "q=travel");

      await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
    });

    it("renders topics as links", async () => {
      mocks.topics.mockResolvedValue(["travel", "photography"]);

      renderPanel(<SearchTopics />, "q=Travel+tag%3Aphoto");

      // The filter segment is the app default, so only the tag is asserted.
      expect((await screen.findByText("travel")).getAttribute("href")).toMatch(/\/travel$/);
      expect(screen.getByText("photography")).toBeInTheDocument();
      expect(mocks.terms.topics.at(-1)).toBe("travel");
    });

    it("renders communities with their subscriber count", async () => {
      mocks.communities.mockResolvedValue([
        { name: "hive-125125", title: "Photography Lovers", about: "Snapshots", subscribers: 1234 }
      ]);

      renderPanel(<SearchCommunities />, "q=photo");

      expect(await screen.findByText("Photography Lovers")).toBeInTheDocument();
      expect(screen.getByText("communities.n-subscribers")).toBeInTheDocument();
      expect(mocks.terms.communities.at(-1)).toBe("photo");
    });

    it("shows the empty state when a lookup comes back empty", async () => {
      mocks.accounts.mockResolvedValue([]);

      renderPanel(<SearchPeople />, "q=zzzz");

      expect(await screen.findByText(NO_MATCHES)).toBeInTheDocument();
    });
  });
});
