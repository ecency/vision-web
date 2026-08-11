import { createFileRoute, Navigate } from '@tanstack/react-router';
import { InstanceConfigManager, t } from '@/core';
import { BlogLayout } from '@/features/blog';
import { SearchResults } from '@/features/blog/components/search-results';

export const Route = createFileRoute('/search')({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      q: (search.q as string) || '',
    };
  },
});

function RouteComponent() {
  const { q } = Route.useSearch();

  // The search entry point is hidden when the owner disables search, but a direct or
  // bookmarked /search?q= would still query Hive; send it home instead. Snapshot read (as
  // elsewhere in the app); a live owner-preview toggle isn't reflected because preview edits
  // are applied via DOM attributes, not the config store. Config is static per real load.
  const searchEnabled = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.instanceConfiguration.layout.search?.enabled ?? true,
  );
  if (!searchEnabled) {
    // The /blog route's validateSearch clamps an empty filter to the first configured one.
    return <Navigate to="/blog" search={{ filter: '' }} replace />;
  }

  return (
    <BlogLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold heading-theme">{t('search')}</h1>
      </div>
      <SearchResults query={q} />
    </BlogLayout>
  );
}
