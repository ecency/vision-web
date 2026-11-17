"use client";

import "@/polyfills";
import "@/core/sdk-init";
import { ClientInit } from "@/app/client-init";
import { Theme } from "@/features/shared/theme";
import { EntryStatsPrefetch } from "@/app/entry-stats-prefetch";
import { EcencyConfigManager } from "@/config";
import { getQueryClient } from "@/core/react-query";
import { QueryCachePersistence } from "@/core/react-query/query-cache-persistence";
import { QueryClientProvider } from "@tanstack/react-query";
import { UIManager } from "@ui/core";
import dynamic from "next/dynamic";
import { PropsWithChildren, lazy, Suspense, useEffect, useState } from "react";
import { ProgressProvider } from "@bprogress/next/app";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then((m) => ({
            default: m.ReactQueryDevtools
          })),
        { ssr: false }
      )
    : () => null;

const AuthUpgradeDialog = lazy(() =>
  import("@/features/shared/auth-upgrade").then((m) => ({ default: m.AuthUpgradeDialog }))
);
const MemoKeyDialog = lazy(() =>
  import("@/features/shared/memo-key").then((m) => ({ default: m.MemoKeyDialog }))
);
const Tracker = lazy(() =>
  import("@/features/monitoring").then((m) => ({ default: m.Tracker }))
);
const Announcements = lazy(() =>
  import("@/features/announcement").then((m) => ({ default: m.Announcements }))
);
const UserActivityRecorder = lazy(() =>
  import("@/features/user-activity").then((m) => ({ default: m.UserActivityRecorder }))
);
const PushNotificationsProvider = lazy(() =>
  import("@/features/push-notifications").then((m) => ({
    default: m.PushNotificationsProvider
  }))
);

/**
 * Defers rendering children until after initial page load for LCP optimization
 */
function DeferredRender({ children }: PropsWithChildren) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Defer non-critical components until after LCP
    const timer = setTimeout(() => setShouldRender(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return shouldRender ? <>{children}</> : null;
}

export function ClientProviders(props: PropsWithChildren) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ProgressProvider
        height="3px"
        color="#357ce6"
        options={{ showSpinner: false }}
        shallowRouting
      >
        <UIManager>
          <ClientInit />
          {/* Keeps the dark class on <html> and <body> on every page. The
              layout no longer renders it (#1262): a pre-paint script sets it,
              and a client render of the root resets both singletons to their
              props, which this puts right on mount. */}
          <Theme />
          {/* Restores the reader's last feed/sidebar cache and keeps it
              written. Outside DeferredRender on purpose: a restore that lands
              after the first paint has missed the paint it exists for. */}
          <QueryCachePersistence />
          {/* Inside UIManager but OUTSIDE DeferredRender on purpose: its
              effect must flush with root hydration, not after the lazy
              feature cascade (#1668). */}
          <EntryStatsPrefetch />
          {props.children}
          {/* Defer non-critical components for LCP optimization */}
          <DeferredRender>
            <Suspense>
              <AuthUpgradeDialog />
              <MemoKeyDialog />
              <EcencyConfigManager.Conditional
                condition={({ visionFeatures }) => visionFeatures.userActivityTracking.enabled}
              >
                <UserActivityRecorder />
              </EcencyConfigManager.Conditional>
              <Tracker />
              <Announcements />
              {/* Side-effect only: WebSocket + Firebase notification setup.
                  Does not provide context - safe to mount outside the children tree.
                  Deferred because notification init is non-critical for LCP. */}
              <PushNotificationsProvider />
            </Suspense>
          </DeferredRender>
        </UIManager>
      </ProgressProvider>
      <Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  );
}
