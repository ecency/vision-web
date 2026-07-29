'use client';

import { getPostQueryOptions } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { InstanceConfigManager, t } from '@/core';
import { useDocumentMeta } from '@/utils/use-document-meta';
import { useThreeSpeakOrientation } from '../hooks/use-three-speak-orientation';
import { BlogLayout } from '../layout/blog-layout';
import { BlogPostBody } from './blog-post-body';
import { BlogPostDiscussion } from './blog-post-discussion';
import { BlogPostFooter } from './blog-post-footer';
import { BlogPostHeader } from './blog-post-header';
import { ErrorMessage } from '@/features/shared/error-message';

export function BlogPostPage() {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });

  const showComments = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.comments?.enabled ?? true,
  );

  // Handle both URL patterns: /:category/:author/:permlink and /:author/:permlink
  const author = (params.author as string)?.replace('@', '') || '';
  const permlink = (params.permlink as string) || '';
  const isRawContent = search?.raw !== undefined;

  const {
    data: entry,
    isLoading,
    error,
    refetch,
  } = useQuery(getPostQueryOptions(author, permlink));

  // Installed here rather than in BlogPostBody so one listener serves both the
  // post body and the comment bodies below it.
  useThreeSpeakOrientation();

  // Extract first image from post body for OG image
  const ogImage = useMemo(() => {
    if (!entry) return undefined;
    const body = entry.original_entry?.body || entry.body || '';
    // Try markdown image syntax first
    const mdMatch = body.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) return mdMatch[1];
    // Try HTML img tag
    const htmlMatch = body.match(/<img[^>]+src=["'](https?:\/\/[^\s"']+)["']/);
    if (htmlMatch) return htmlMatch[1];
    // Try json_metadata image
    const metaImage = entry.json_metadata?.image?.[0];
    if (metaImage) return metaImage;
    return undefined;
  }, [entry]);

  // Extract description from post body
  const ogDescription = useMemo(() => {
    if (!entry) return undefined;
    const body = entry.original_entry?.body || entry.body || '';
    // Strip HTML tags including unclosed forms (`<[^>]*(?:>|$)`) so a
    // truncated `…<script` substring can't leak into the meta-description
    // (head-tag rendering context). Loop handles nested payloads like
    // `<scr<script>ipt>`.
    let stripped = body;
    let prev: string;
    do {
      prev = stripped;
      stripped = stripped.replace(/<[^>]*(?:>|$)/g, '');
    } while (stripped !== prev);
    const clean = stripped
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*_~`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 200) + (clean.length > 200 ? '...' : '');
  }, [entry]);

  useDocumentMeta(
    entry
      ? {
          title: entry.title,
          description: ogDescription,
          ogImage,
          ogType: 'article',
          twitterCard: ogImage ? 'summary_large_image' : 'summary',
        }
      : {},
  );

  if (isLoading) {
    return (
      <BlogLayout>
        <div className="text-center py-12 text-theme-muted">
          {t('loadingPost')}
        </div>
      </BlogLayout>
    );
  }

  if (error) {
    return (
      <BlogLayout>
        <ErrorMessage onRetry={() => refetch()} />
      </BlogLayout>
    );
  }

  if (!entry) {
    return (
      <BlogLayout>
        <div className="text-center py-12 text-theme-muted">
          {t('postNotFound')}
        </div>
      </BlogLayout>
    );
  }

  return (
    <BlogLayout>
      <article className="space-y-4 sm:space-y-6">
        <BlogPostHeader entry={entry} />
        <BlogPostBody entry={entry} isRawContent={isRawContent} />
        <BlogPostFooter entry={entry} />
        {showComments && (
          <BlogPostDiscussion entry={entry} isRawContent={isRawContent} />
        )}
      </article>
    </BlogLayout>
  );
}
