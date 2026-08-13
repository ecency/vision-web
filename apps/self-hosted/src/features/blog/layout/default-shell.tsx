import type { PropsWithChildren } from 'react';
import { useThemeComponents } from '@/themes/use-theme-components';
import { BlogPage } from './blog-page';

/**
 * The shared page frame every CSS-only template renders: sidebar and content
 * column in a grid, with the sidebar on the right from `lg` up and stacked
 * above the content below it. Which sidebar SECTIONS show stays pure CSS via
 * [data-show-*]. Navigation and Sidebar resolve through the theme registry,
 * so a theme can replace either without owning the whole frame.
 */
export function DefaultShell(props: PropsWithChildren) {
  const { Navigation, Sidebar } = useThemeComponents();
  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="container mx-auto container-padding-theme">
        {/* Mobile/Tablet: Single column with sidebar on top */}
        <div className="blog-layout-grid flex flex-col lg:grid layout-gap-theme">
          {/* Sidebar - appears first on mobile/tablet */}
          <div className="blog-sidebar-container order-1">
            <Sidebar />
          </div>

          {/* Main content - appears second on mobile/tablet */}
          <main id="main-content" className="blog-main-container order-2 items-start mt-4 sm:mt-8 section-gap-theme">
            <Navigation />
            <BlogPage>{props.children}</BlogPage>
          </main>
        </div>
      </div>
    </div>
  );
}
