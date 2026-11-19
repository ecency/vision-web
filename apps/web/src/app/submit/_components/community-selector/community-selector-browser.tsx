import { CommunitySelectorItem } from "@/app/submit/_components/community-selector/community-selector-item";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Community } from "@/entities";
import { LinearProgress } from "@/features/shared";
import { getAccountSubscriptionsQueryOptions, getCommunitiesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { FormControl } from "@ui/input";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import useMount from "react-use/lib/useMount";

interface BrowserProps {
  onSelect: (name: string | null) => void;
  onHide: () => void;
}

const normalizeForQuery = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeForMatch = (value: string) =>
  normalizeForQuery(value).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

const matchesQuery = (value: string | null | undefined, query: string) =>
  query !== "" && normalizeForMatch(value ?? "").includes(query);

type SearchResult = {
  name: string | null;
  title: string;
  community?: Community;
};

export function CommunitySelectorBrowser({ onSelect, onHide }: BrowserProps) {
  const { activeUser } = useActiveAccount();
  const {
    data: subscriptions,
    refetch,
    isLoading: isSubsLoading
  } = useQuery(getAccountSubscriptionsQueryOptions(activeUser?.username));

  const [query, setQuery] = useState("");
  const [fetchingQuery, setFetchingQuery] = useState("");

  const sanitizedQuery = useMemo(() => normalizeForQuery(query), [query]);
  const matchableQuery = useMemo(() => normalizeForMatch(query), [query]);
  const hasSearchQuery = sanitizedQuery !== "" && matchableQuery !== "";

  const { data: results, isLoading } = useQuery(
    getCommunitiesQueryOptions(
      "rank",
      fetchingQuery,
      14,
      activeUser?.username,
      fetchingQuery !== ""
    )
  );

  const fallbackQuery = useMemo(() => {
    if (!hasSearchQuery) {
      return "";
    }

    const hyphenated = sanitizedQuery.replace(/\s+/g, "-");

    return hyphenated !== sanitizedQuery ? hyphenated : "";
  }, [hasSearchQuery, sanitizedQuery]);

  const { data: fallbackResults, isLoading: isFallbackLoading } = useQuery(
    getCommunitiesQueryOptions(
      "rank",
      fallbackQuery,
      14,
      activeUser?.username,
      fallbackQuery !== ""
    )
  );

  useMount(() => {
    refetch();
    document.getElementById("search-communities-input")?.focus();
  });

  useDebounce(
    () => {
      setFetchingQuery(hasSearchQuery ? sanitizedQuery : "");
    },
    300,
    [hasSearchQuery, sanitizedQuery]
  );

  const myBlogLabel = i18next.t("community-selector.my-blog");

  const combinedResults = useMemo(() => {
    if (!hasSearchQuery) {
      return [] as Community[];
    }

    const unique = new Map<string, Community>();

    (results ?? []).forEach((community) => {
      unique.set(community.name, community);
    });

    (fallbackResults ?? []).forEach((community) => {
      if (!unique.has(community.name)) {
        unique.set(community.name, community);
      }
    });

    return Array.from(unique.values());
  }, [fallbackResults, hasSearchQuery, results]);

  const normalizedResults = useMemo(() => {
    if (!hasSearchQuery) {
      return [] as Community[];
    }

    const filtered = combinedResults.filter(
      (community) =>
        matchesQuery(community.name, matchableQuery) ||
        matchesQuery(community.title, matchableQuery) ||
        matchesQuery(community.about, matchableQuery)
    );

    return filtered.length > 0 ? filtered : combinedResults;
  }, [combinedResults, hasSearchQuery, matchableQuery]);

  const normalizedSubscriptions = useMemo(() => {
    if (!hasSearchQuery || !subscriptions) {
      return [];
    }

    return subscriptions
      .filter(
        ([name, title]) =>
          matchesQuery(name, matchableQuery) || matchesQuery(title, matchableQuery)
      )
      .map(([name, title]) => ({ name, title }));
  }, [subscriptions, hasSearchQuery, matchableQuery]);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!hasSearchQuery) {
      return [];
    }

    const items: SearchResult[] = [];
    const seen = new Set<string | null>();

    if (matchesQuery(myBlogLabel, matchableQuery)) {
      items.push({ name: null, title: myBlogLabel });
      seen.add(null);
    }

    const communitiesByName = new Map(
      normalizedResults.map((community) => [community.name, community])
    );

    normalizedSubscriptions.forEach(({ name, title }) => {
      if (!seen.has(name)) {
        items.push({ name, title, community: name ? communitiesByName.get(name) : undefined });
        seen.add(name);
      }
    });

    normalizedResults.forEach((community) => {
      if (!seen.has(community.name)) {
        items.push({ name: community.name, title: community.title, community });
        seen.add(community.name);
      }
    });

    return items;
  }, [hasSearchQuery, matchableQuery, myBlogLabel, normalizedResults, normalizedSubscriptions]);

  const search = (
    <div className="search">
      <FormControl
        type="text"
        placeholder={i18next.t("community-selector.search-placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        id="search-communities-input"
        spellCheck={true}
      />
    </div>
  );

  if (hasSearchQuery) {
    return (
      <div className="browser">
        {search}

        <div className="browser-list mt-4">
          {(isLoading || isSubsLoading || isFallbackLoading) && <LinearProgress />}
          <div className="flex flex-wrap py-3 gap-3">
            {searchResults.map((item) => (
              <CommunitySelectorItem
                key={item.name ?? "my-blog"}
                name={item.name}
                title={item.title}
                community={item.community}
                onSelect={onSelect}
                onHide={onHide}
              />
            ))}
            {searchResults.length === 0 && !isLoading && !isSubsLoading && (
              <div className="empty-list">{i18next.t("g.empty-list")}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="browser">
      {search}

      <div className="browser-list mt-4">
        {isSubsLoading && <LinearProgress />}
        <div className="flex flex-wrap py-3 gap-3">
          <CommunitySelectorItem
            name={null}
            title={i18next.t("community-selector.my-blog")}
            onSelect={onSelect}
            onHide={onHide}
          />

          {subscriptions?.map((x) => (
            <CommunitySelectorItem
              key={x[0]}
              name={x[0]}
              title={x[1]}
              onSelect={onSelect}
              onHide={onHide}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
