import { vi, describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { EntryStatsPrefetch } from "@/app/entry-stats-prefetch";
import { getPostTipsQueryOptions, getProMembersQueryOptions } from "@ecency/sdk";

/*
  Pins for #1668 item 3: the entry-stats caches must warm at root hydration
  for entry paths only, with the author lowercased to match entry.author.
*/
describe("EntryStatsPrefetch", () => {
  let queryClient: QueryClient;
  let prefetchSpy: ReturnType<typeof vi.spyOn>;

  const mount = (path: string) => {
    nav.pathname = path;
    return render(
      <QueryClientProvider client={queryClient}>
        <EntryStatsPrefetch />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchSpy = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined as never);
    vi.mocked(getPostTipsQueryOptions).mockClear();
    vi.mocked(getProMembersQueryOptions).mockClear();
  });

  it("prefetches tips and pro-members for a two-segment entry path, lowercasing the author", () => {
    mount("/@AuThor.One/some-permlink-123");
    expect(prefetchSpy).toHaveBeenCalledTimes(2);
    expect(getPostTipsQueryOptions).toHaveBeenCalledWith("author.one", "some-permlink-123");
    expect(getProMembersQueryOptions).toHaveBeenCalled();
  });

  it("prefetches for a category entry path", () => {
    mount("/hive-125125/@author/some-permlink");
    expect(prefetchSpy).toHaveBeenCalledTimes(2);
    expect(getPostTipsQueryOptions).toHaveBeenCalledWith("author", "some-permlink");
  });

  it("does not prefetch for a profile section", () => {
    mount("/@author/posts");
    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it("does not prefetch for non-entry routes", () => {
    mount("/trending");
    expect(prefetchSpy).not.toHaveBeenCalled();
  });
});
