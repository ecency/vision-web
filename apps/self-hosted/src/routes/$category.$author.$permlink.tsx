import { createFileRoute } from '@tanstack/react-router';
import { BlogPostPage } from '@/features/blog/components/blog-post-page';
import { resolvePostsFilter } from '@/features/blog/utils/post-filters';

export const Route = createFileRoute('/$category/$author/$permlink')({
  component: BlogPostPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { raw?: true; filter?: string } => {
    return {
      raw: search.raw !== undefined ? true : undefined,
      // Same retention as /$author/$permlink: the Reader rail reads it to
      // stay on the feed the reader was browsing.
      filter:
        search.filter !== undefined
          ? resolvePostsFilter(search.filter)
          : undefined,
    };
  },
});
