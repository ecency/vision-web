import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Shared, hoisted state the mocks below read at render time.
const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  queryFn: vi.fn(),
  sentinelFiresOnMount: false,
  optionsCalls: [] as {
    q: string;
    sort: string;
    hideLow: boolean;
    since?: string;
    includeNsfw?: boolean;
  }[]
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params
}));

// The global spec setup mocks @ecency/sdk without the search options, so this
// spec has to supply them. Everything except the queryFn stays faithful to the
// real factory - `initialData` in the component only behaves the way finding 10
// describes if getNextPageParam and `enabled` behave like production.
vi.mock("@ecency/sdk", () => ({
  getSearchApiInfiniteQueryOptions: (
    q: string,
    sort: string,
    hideLow: boolean,
    since?: string,
    votes?: number,
    includeNsfw?: boolean
  ) => {
    mocks.optionsCalls.push({ q, sort, hideLow, since, includeNsfw });
    return {
      queryKey: ["search", "api", q, sort, hideLow, since, includeNsfw],
      queryFn: () => mocks.queryFn(),
      initialPageParam: undefined,
      getNextPageParam: (lastPage: { scroll_id?: string }) => lastPage?.scroll_id,
      enabled: !!q,
      retry: false
    };
  }
}));

vi.mock("@/features/shared", () => ({
  // jsdom has no IntersectionObserver, so the sentinel never fires on its own
  // and most fetches here are driven by the mount refetch and the show-more
  // button. In a browser the sentinel sits at the bottom of a short results
  // card and fires on mount, which is what bootstraps page 1 - tests that care
  // about that path opt in with mocks.sentinelFiresOnMount.
  DetectBottom: ({ onBottom }: { onBottom: () => void }) => {
    React.useEffect(() => {
      if (mocks.sentinelFiresOnMount) {
        onBottom();
      }
    }, [onBottom]);
    return null;
  },
  LinearProgress: () => <div role="progressbar" />,
  SearchListItem: ({ res }: { res: { permlink: string } }) => <div>{res.permlink}</div>
}));

vi.mock("@/features/ui", () => ({
  // `outline` is a Button prop, not a DOM attribute - drop it rather than
  // forward it and have React warn on every render.
  Button: ({ outline, ...rest }: React.ComponentProps<"button"> & { outline?: boolean }) => (
    <button {...rest} />
  )
}));

vi.mock("@/app/search/_components/search-advanced-form", () => ({
  SearchAdvancedForm: () => <div>advanced-form</div>
}));

import { SearchComment } from "@/app/search/_components/search-comment";

const NO_MATCHES = "g.no-matches"; // i18next is mocked to return the key
const ERROR_FAILED = "search-comment.error-failed";

function page(results: { author: string; permlink: string }[], scrollId?: string) {
  return { hits: results.length, took: 1, results, scroll_id: scrollId };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing awaits a rejection until the component does; keep node quiet.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function renderSearch(search: string) {
  mocks.params = new URLSearchParams(search);
  // Default staleTime: the seeded `initialData` is stale at once, so mounting
  // requests page 1 - the job the bottom sentinel does in the browser.
  // refetchOnMount mirrors makeQueryClient(). Without it the app's real
  // bootstrap path is not the one under test: every fetch here would come from
  // a mount refetch production does not do, which is how a first page that
  // only ever loaded from the viewport sentinel looked healthy in this suite.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } }
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SearchComment />
      </QueryClientProvider>
    )
  };
}

describe("SearchComment", () => {
  beforeEach(() => {
    mocks.queryFn.mockReset();
    mocks.optionsCalls = [];
    mocks.sentinelFiresOnMount = false;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("first page (finding 10)", () => {
    it("does not claim 'no matches' before page 1 has landed", async () => {
      const first = deferred<ReturnType<typeof page>>();
      mocks.queryFn.mockReturnValue(first.promise);

      renderSearch("q=coffee");

      // The query is seeded with initialData, so it is "success" with zero
      // pages from the first paint and isLoading is never true. Without the
      // pending guard the empty state renders here, before the request is even
      // answered.
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();

      first.resolve(page([]));

      expect(await screen.findByText(NO_MATCHES)).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("shows the empty state right away when there is nothing to search for", async () => {
      renderSearch("");

      // No `q` means no request is coming, so there is nothing to wait for.
      expect(await screen.findByText(NO_MATCHES)).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(mocks.queryFn).not.toHaveBeenCalled();
    });

    it("renders the results once they land", async () => {
      mocks.queryFn.mockResolvedValue(page([{ author: "alice", permlink: "first-post" }]));

      renderSearch("q=coffee");

      expect(await screen.findByText("first-post")).toBeInTheDocument();
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
      expect(screen.getByText("search-comment.matches-singular")).toBeInTheDocument();
    });
  });

  describe("failures (finding 8)", () => {
    it("renders the error state, not 'no matches', when the search is rejected", async () => {
      const error = Object.assign(new Error("Request failed with status 400"), {
        status: 400,
        data: { error: "Parsed query is empty!" }
      });
      mocks.queryFn.mockRejectedValue(error);

      renderSearch("q=author%3Ademo");

      expect(await screen.findByText(ERROR_FAILED)).toBeInTheDocument();
      // The whole point of the branch: a failure used to be indistinguishable
      // from an empty result set.
      expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("reports a rejected query without leaking the backend's own words", async () => {
      mocks.queryFn.mockRejectedValue(
        Object.assign(new Error("Request failed with status 400"), {
          status: 400,
          data: { message: { q: "Maximum 5 tags!" } }
        })
      );

      renderSearch("q=coffee");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(ERROR_FAILED);
      // The backend's text is English only and lives in another repo, so it
      // stays on the error object for Sentry instead of reaching the page.
      expect(screen.queryByText("Maximum 5 tags!")).not.toBeInTheDocument();
    });

    it("says nothing extra when the failure carries no usable body", async () => {
      mocks.queryFn.mockRejectedValue(new Error("Failed to fetch"));

      renderSearch("q=coffee");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(ERROR_FAILED);
      // A proxy HTML page or a transport error has nothing to tell a user.
      expect(alert).not.toHaveTextContent("Failed to fetch");
    });

    it("stays quiet on /search with no query at all", async () => {
      // fetchNextPage does not consult `enabled`, so the sentinel used to post
      // an empty query and collect a 400 the user never asked for. Drives the
      // real bootstrap path, not the mount refetch, because that is where the
      // doomed request came from.
      mocks.sentinelFiresOnMount = true;
      mocks.queryFn.mockRejectedValue(
        Object.assign(new Error("Request failed with status 400"), {
          status: 400,
          data: { message: { q: "Query required" } }
        })
      );

      renderSearch("q=");

      expect(await screen.findByText(NO_MATCHES)).toBeInTheDocument();
      await waitFor(() => expect(mocks.queryFn).not.toHaveBeenCalled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("still bootstraps page 1 from the sentinel when there is a query", async () => {
      // The empty-q guard must not cost the bootstrap it wraps.
      mocks.sentinelFiresOnMount = true;
      mocks.queryFn.mockResolvedValue(page([{ author: "alice", permlink: "first-post" }]));

      renderSearch("q=coffee");

      expect(await screen.findByText("first-post")).toBeInTheDocument();
    });

    it("loads page 1 without the sentinel ever coming into view", async () => {
      // The sentinel sits below the results, so with the advanced panel open on
      // a short viewport it starts off screen and never fires. Page 1 must not
      // depend on it, or that URL shows a spinner and issues no request at all.
      mocks.sentinelFiresOnMount = false;
      mocks.queryFn.mockResolvedValue(page([{ author: "alice", permlink: "first-post" }]));

      renderSearch("q=coffee&adv=1");

      expect(await screen.findByText("first-post")).toBeInTheDocument();
      expect(mocks.queryFn).toHaveBeenCalledTimes(1);
    });

    it("keeps the results a user is reading when loading more fails", async () => {
      mocks.queryFn
        .mockResolvedValueOnce(page([{ author: "alice", permlink: "first-post" }], "scroll-2"))
        .mockRejectedValueOnce(new Error("Failed to fetch"));

      renderSearch("q=coffee");

      const showMore = await screen.findByText("search-comment.show-more");
      fireEvent.click(showMore);

      await waitFor(() => expect(mocks.queryFn).toHaveBeenCalledTimes(2));
      expect(screen.getByText("first-post")).toBeInTheDocument();
      expect(screen.queryByText(ERROR_FAILED)).not.toBeInTheDocument();
    });
  });

  describe("advanced panel (finding 9)", () => {
    it("opens the panel a shared adv=1 URL belongs to", () => {
      renderSearch("q=coffee+author%3Ademo&adv=1");

      expect(screen.getByText("advanced-form")).toBeInTheDocument();
      expect(screen.getByText("g.close")).toBeInTheDocument();
    });

    it("stays closed without adv=1", () => {
      renderSearch("q=coffee");

      expect(screen.queryByText("advanced-form")).not.toBeInTheDocument();
      expect(screen.getByText("search-comment.advanced")).toBeInTheDocument();
    });

    it("lets the user's own toggle win over the URL in both directions", async () => {
      renderSearch("q=coffee&adv=1");

      fireEvent.click(screen.getByText("g.close"));
      expect(screen.queryByText("advanced-form")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("search-comment.advanced"));
      expect(screen.getByText("advanced-form")).toBeInTheDocument();
    });
  });

  describe("search inputs come from the URL (finding 7)", () => {
    const lastCall = () => mocks.optionsCalls[mocks.optionsCalls.length - 1];

    it("ignores a stale localStorage date and stays all-time by default", () => {
      // The advanced form's Date select used to be seeded from this key while
      // the results read the URL only. Reading it here would pin every visitor
      // to whatever the other feature last wrote.
      localStorage.setItem("recent_date", "year");

      renderSearch("q=coffee");

      expect(lastCall().since).toBeUndefined();
    });

    it("honors an explicit date from the URL", () => {
      renderSearch("q=coffee&date=week");

      const since = lastCall().since;
      expect(since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      const drift = Math.abs(
        Date.now() - 7 * 24 * 60 * 60 * 1000 - new Date(`${since}Z`).getTime()
      );
      expect(drift).toBeLessThan(60_000);
    });

    it("passes sort, hide-low and nsfw through", () => {
      renderSearch("q=coffee&sort=newest&hd=0&nsfw=1");

      expect(lastCall()).toMatchObject({
        q: "coffee",
        sort: "newest",
        hideLow: false,
        includeNsfw: true
      });
    });

    it("hides low-value results unless the URL opts out", () => {
      renderSearch("q=coffee");

      expect(lastCall()).toMatchObject({ sort: "relevance", hideLow: true });
      expect(lastCall().includeNsfw).toBeUndefined();
    });
  });
});
