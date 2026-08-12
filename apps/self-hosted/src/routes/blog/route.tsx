import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { BlogLayout } from '@/features/blog';
import { useThemeComponents } from '@/themes/use-theme-components';
import { resolvePostsFilter } from '@/features/blog/utils/post-filters';

export const Route = createFileRoute('/blog')({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => {
    // Clamp to the configured filters so a stale bookmark or the historic
    // hardcoded default never selects a feed the owner disabled.
    return {
      filter: resolvePostsFilter(search.filter),
    };
  },
});

function HostingBanner() {
  const isApex = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'blogs.ecency.com' || host === 'localhost';
  }, []);

  if (!isApex) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
      <div className="container mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-medium">
          Start your own Hive-powered blog - custom subdomain, instant setup,
          from $2/month
        </p>
        <Link
          to="/hosting"
          className="shrink-0 ml-4 px-4 py-1.5 bg-white !text-blue-600 text-sm font-semibold rounded-full hover:bg-blue-50 transition-colors"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}

function RouteComponent() {
  const { filter } = Route.useSearch();
  const { ArchiveList } = useThemeComponents();
  return (
    <>
      <HostingBanner />
      <BlogLayout>
        <ArchiveList filter={filter} />
      </BlogLayout>
    </>
  );
}
