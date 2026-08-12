'use client';

import { type Entry, type SearchResult, searchQueryOptions } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { t } from '@/core';
import { useInstanceConfig } from '../hooks/use-instance-config';
import { useThemeComponents } from '@/themes/use-theme-components';

interface Props {
  query: string;
}

/**
 * The search API returns a SearchResult (created_at, img_url, top-level tags), but BlogPostItem
 * expects an Entry (created, json_metadata.image/tags, active_votes, ...). Passing the raw result
 * left `created` undefined, and formatDate(undefined) threw during render, taking down the whole
 * app via the root ErrorBoundary. Map into the shape BlogPostItem reads.
 */
function searchResultToEntry(result: SearchResult): Entry {
  return {
    author: result.author,
    permlink: result.permlink,
    title: result.title,
    body: result.body,
    category: result.category,
    created: result.created_at,
    children: result.children,
    active_votes: [],
    json_metadata: {
      tags: result.tags,
      image: result.img_url ? [result.img_url] : undefined,
    },
  } as unknown as Entry;
}

export function SearchResults({ query }: Props) {
  // The entry card resolves through the theme registry, so search results
  // wear the active theme's entry look instead of the default card.
  const { PostCard } = useThemeComponents();
  const { username, communityId, isCommunityMode } = useInstanceConfig();

  // Build search query scoped to the blog/community
  const scopedQuery = useMemo(() => {
    const baseQuery = query.trim();
    if (!baseQuery) return '';

    if (isCommunityMode && communityId) {
      // Search within community (matches main app format)
      return `${baseQuery} category:${communityId}`;
    }
    // Search within blog author's posts
    return `${baseQuery} author:${username} type:post`;
  }, [query, username, communityId, isCommunityMode]);

  const { data, isLoading, error } = useQuery({
    ...searchQueryOptions(scopedQuery, 'newest', '0'),
    enabled: !!scopedQuery,
  });

  if (!query.trim()) {
    return (
      <div className="text-center py-12 text-theme-muted">
        {t('enter_search_query')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12 text-theme-muted">{t('searching')}</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-500">{t('search_error')}</div>
    );
  }

  const results = data?.results || [];

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-theme-muted">
        {t('no_results')}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-sm text-theme-muted">
        {data?.hits || results.length} {t('results_for')} "{query}"
      </div>
      <div className="blog-posts-list">
        {results.map((result, index) => (
          <PostCard
            key={`${result.author}/${result.permlink}`}
            entry={searchResultToEntry(result)}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
