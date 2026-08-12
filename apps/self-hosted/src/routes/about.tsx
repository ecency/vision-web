import { createFileRoute } from '@tanstack/react-router';
import { BlogLayout } from '@/features/blog';
import { AboutPage } from '@/features/blog/components/about-page';

export const Route = createFileRoute('/about')({
  component: RouteComponent,
});

function RouteComponent() {
  // Through the theme Shell seam like the feed and search: every template
  // frames the About surface its own way.
  return (
    <BlogLayout>
      <AboutPage />
    </BlogLayout>
  );
}
