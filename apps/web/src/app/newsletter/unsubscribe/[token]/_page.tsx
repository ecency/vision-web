"use client";

import { describeDigest, newsletterApi, NewsletterApiError, newsletterKeys } from "@/features/newsletter";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import Link from "next/link";

/**
 * Landing page for the unsubscribe link. Two levels, both explicit buttons: leave this one
 * digest, or stop all Ecency email to the address. Loading the page inspects only; a mail
 * client's one-click unsubscribe never reaches this page, it POSTs straight to the API.
 */
export function UnsubscribePage({ token }: { token: string }) {
  const inspect = useQuery({
    queryKey: newsletterKeys.unsubscribeInspect(token),
    queryFn: () => newsletterApi.inspectUnsubscribe(token),
    retry: false,
    staleTime: Infinity
  });
  const leaveOne = useMutation({ mutationFn: () => newsletterApi.unsubscribeOne(token) });
  const stopAll = useMutation({ mutationFn: () => newsletterApi.unsubscribeEverything(token) });

  const s = inspect.data?.subscription;
  const name = s ? describeDigest(s.type, s.target) : "";

  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{i18next.t("newsletter.unsubscribe-title")}</h1>

        {inspect.isLoading ? (
          <p className="text-sm text-gray-500">{i18next.t("g.loading")}</p>
        ) : inspect.isError ? (
          <Alert appearance="warning">
            {inspect.error instanceof NewsletterApiError && inspect.error.status === 404
              ? i18next.t("newsletter.unsubscribe-invalid")
              : i18next.t("newsletter.error-unavailable")}
          </Alert>
        ) : stopAll.isSuccess ? (
          <Alert appearance="success">{i18next.t("newsletter.stopped-all", { email: stopAll.data.email })}</Alert>
        ) : leaveOne.isSuccess ? (
          <>
            <Alert appearance="success">
              {leaveOne.data.alreadyEnded
                ? i18next.t("newsletter.unsubscribe-already", { name })
                : i18next.t("newsletter.unsubscribe-done", { name })}
            </Alert>
            {(inspect.data?.otherSubscriptions ?? 0) > 0 && (
              <p className="text-sm text-gray-500">
                {i18next.t("newsletter.unsubscribe-others", { count: inspect.data?.otherSubscriptions })}
              </p>
            )}
            <div>
              <Button appearance="gray-link" size="sm" onClick={() => stopAll.mutate()} isLoading={stopAll.isPending}>
                {i18next.t("newsletter.stop-all", { email: inspect.data?.email })}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              {s?.ended
                ? i18next.t("newsletter.unsubscribe-already", { name })
                : i18next.t("newsletter.unsubscribe-intro", { name, email: inspect.data?.email })}
            </p>
            {(leaveOne.isError || stopAll.isError) && (
              <Alert appearance="warning">{i18next.t("newsletter.error-unavailable")}</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {!s?.ended && (
                <Button onClick={() => leaveOne.mutate()} isLoading={leaveOne.isPending} disabled={leaveOne.isPending || stopAll.isPending}>
                  {i18next.t("newsletter.unsubscribe-one", { name })}
                </Button>
              )}
              <Button
                appearance="danger"
                outline={true}
                onClick={() => stopAll.mutate()}
                isLoading={stopAll.isPending}
                disabled={leaveOne.isPending || stopAll.isPending}
              >
                {i18next.t("newsletter.stop-all", { email: inspect.data?.email })}
              </Button>
            </div>
            <p className="text-xs text-gray-500">{i18next.t("newsletter.unsubscribe-hint")}</p>
            <Link href="/" className="text-blue-dark-sky text-sm">
              {i18next.t("newsletter.back-home")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
