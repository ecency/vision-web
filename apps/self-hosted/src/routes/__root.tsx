import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { ConfigManager } from "@ecency/sdk";
import { queryClient } from "@/consts/react-query";
import { FloatingMenu } from "@/features/floating-menu";
import { AuthProvider, useIsBlogOwner } from "@/features/auth";
import { ClaimLanding } from "@/features/claim";
import { ErrorBoundary, SkipToContent } from "@/features/shared";
import {
  clearHiveAuthSession,
  clearUser,
  getHiveAuthSession,
  getUser,
} from "@/features/auth/storage";
import { authenticationStore } from "@/store";
import { t, InstanceConfigManager } from "@/core";
import { loadDmcaLists } from "@/core/dmca";

// Check if we're in development mode
const isDev = process.env.NODE_ENV === "development";

// Only load devtools in development
const ReactQueryDevtools = isDev
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((mod) => ({
        default: mod.ReactQueryDevtools,
      }))
    )
  : () => null;

// Sync SDK's internal QueryClient with the app's client so SDK-side
// cache invalidations and optimistic updates target the same cache.
ConfigManager.setQueryClient(queryClient);

// Load the DMCA lists the SDK's post queries filter against. Started here, at
// module load, so the request is in flight before React mounts and well before
// any post query can resolve. Not awaited: the lists are fetched from a remote
// origin and nothing about rendering the blog may depend on that origin being
// reachable.
loadDmcaLists(queryClient);

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
  beforeLoad: () => {
    const storedUser = getUser();
    const storedHiveAuth = getHiveAuthSession();

    if (storedUser) {
      // Check if token has expired
      if (storedUser.expiresAt && Date.now() > storedUser.expiresAt) {
        // Token expired, clear session
        clearUser();
        clearHiveAuthSession();
      } else {
        authenticationStore.getState().setUser(storedUser);
      }
    }
    if (storedHiveAuth) {
      // Check if HiveAuth session has expired
      if (Date.now() > storedHiveAuth.expire * 1000) {
        clearHiveAuthSession();
      } else {
        authenticationStore.getState().setSession(storedHiveAuth);
      }
    }
  },
});

function RootComponent() {
  // Unclaimed *.blogs.ecency.com subdomains are served the shared default template config, which
  // carries `template: true`. Short-circuit the whole app to the claim landing so no route renders
  // someone else's content. Reactive so it flips once the runtime config replaces the build-time one.
  const isTemplate = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.template === true
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isDev && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
      <SkipToContent />
      <ErrorBoundary>
        {isTemplate ? (
          <ClaimLanding />
        ) : (
          <AuthProvider>
            <Outlet />
            <AuthorizedFloatingMenu />
          </AuthProvider>
        )}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

function NotFound() {
  useEffect(() => {
    const prev = document.title;
    document.title = t("page_not_found");
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold mb-4 heading-theme">404</h1>
        <p className="text-xl mb-2 text-theme-primary">{t("page_not_found")}</p>
        <p className="text-theme-muted mb-8">{t("page_not_found_description")}</p>
        <Link
          to="/blog"
          search={{ filter: "posts" }}
          className="inline-block px-6 py-2 rounded-lg bg-black text-white hover:bg-black/80 transition-colors font-medium"
        >
          {t("back_to_blog")}
        </Link>
      </div>
    </div>
  );
}

// Show FloatingMenu for blog owner or in development mode
function AuthorizedFloatingMenu() {
  const isBlogOwner = useIsBlogOwner();
  const isDevelopment = process.env.NODE_ENV === "development";

  // Show in dev mode for testing, or when authenticated as blog owner
  if (!isDevelopment && !isBlogOwner) {
    return null;
  }

  return <FloatingMenu show={true} />;
}
