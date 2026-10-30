"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import i18next from "i18next";
// The lazy facade, never @sentry/nextjs: this module ships with every profile
// and community page, and a static SDK import would put it back on their eager
// bundle (see lazy-sentry.ts).
import { sentry } from "@/core/sentry/lazy-sentry";
import { Button } from "@ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error module body for the profile, community and wave segments (#2000).
 *
 * Those pages throw when their account, community or post lookup fails
 * upstream, so a failure is not answered as "does not exist". Where it renders:
 *
 * - Routes with no Suspense above the page (profile index and feed tabs,
 *   community pages, the wave page): a full page load never reaches it. The
 *   throw is a shell error, Next answers 500 and the server sends a retryable
 *   503 (React's server renderer does not run error boundaries, see
 *   global-error.tsx).
 * - Profile sub-pages with their own loading.tsx (followers, following, ...):
 *   the shell has already streamed with status 200 (no-store, the layout's
 *   lookup marks it), React client-renders the failed boundary and this shows.
 * - Any CLIENT-side navigation: the error arrives in the RSC payload.
 *
 * Either way it keeps the layout (profile card, menu, community header) around
 * a retry instead of the full-page global 500.
 *
 * A server-render error carries a `digest` and was already seen server-side,
 * so only an error thrown by the client render is reported from here.
 */
export function LookupUnavailableError({ error, reset }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!error.digest) sentry.captureException(error);
  }, [error]);

  const retry = () => {
    // Refetch the server components, then re-render the segment with them.
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className="flex flex-col items-start gap-4 p-6 rounded-xl border border-[--border-color] bg-white dark:bg-dark-200">
      <h2 className="text-lg font-semibold">{i18next.t("lookup-unavailable.title")}</h2>
      <p className="text-gray-600 dark:text-gray-400">
        {i18next.t("lookup-unavailable.description")}
      </p>
      <Button onClick={retry}>{i18next.t("lookup-unavailable.retry")}</Button>
    </div>
  );
}
