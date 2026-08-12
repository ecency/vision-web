import { createFileRoute } from '@tanstack/react-router';
import { BlogPostPage } from '@/features/blog/components/blog-post-page';
import { resolvePostsFilter } from '@/features/blog/utils/post-filters';

export const Route = createFileRoute('/$author/$permlink')({
  component: BlogPostPage,
  // Optional keys in the annotation, so post links that carry no search at
  // all keep typechecking; the inferred shape would demand every key.
  validateSearch: (
    search: Record<string, unknown>,
  ): { raw?: true; filter?: string } => {
    return {
      raw: search.raw !== undefined ? true : undefined,
      // Retained (clamped) so a theme whose archive stays visible beside the
      // open post (Reader) keeps showing the feed the reader was browsing.
      // Absent on canonical deep links, so ordinary post URLs are unchanged.
      filter:
        search.filter !== undefined
          ? resolvePostsFilter(search.filter)
          : undefined,
    };
  },
});
