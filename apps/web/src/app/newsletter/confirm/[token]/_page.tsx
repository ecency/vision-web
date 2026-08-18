"use client";

import { describeDigest, newsletterApi, NewsletterApiError, newsletterKeys } from "@/features/newsletter";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import Link from "next/link";

/**
 * Landing page for the confirmation link in the email. Loading the page only INSPECTS
 * the token (a GET); nothing is confirmed until the person presses the button, which
 * POSTs. Link scanners and mail-client prefetchers therefore confirm nothing.
 */
export function ConfirmPage({ token }: { token: string }) {
  const inspect = useQuery({
    queryKey: newsletterKeys.confirmInspect(token),
    queryFn: () => newsletterApi.inspectConfirm(token),
    retry: false,
    staleTime: Infinity
  });
  const confirm = useMutation({ mutationFn: () => newsletterApi.confirm(token) });

  const describe = (s: { type: string; target: string; cadence: string }) =>
    `${i18next.t(`newsletter.cadence.${s.cadence}`)} · ${describeDigest(s.type, s.target)}`;

  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{i18next.t("newsletter.confirm-title")}</h1>

        {inspect.isLoading ? (
          <p className="text-sm text-gray-500">{i18next.t("g.loading")}</p>
        ) : inspect.isError ? (
          <Alert appearance="warning">
            {inspect.error instanceof NewsletterApiError && inspect.error.status === 404
              ? i18next.t("newsletter.confirm-invalid")
              : i18next.t("newsletter.error-unavailable")}
          </Alert>
        ) : confirm.isSuccess ? (
          <>
            <Alert appearance="success">{i18next.t("newsletter.confirm-done", { email: confirm.data.email })}</Alert>
            <ul className="text-sm list-disc pl-5">
              {confirm.data.subscriptions.map((s, i) => (
                <li key={i}>{describe(s)}</li>
              ))}
            </ul>
            <Link href="/" className="text-blue-dark-sky text-sm">
              {i18next.t("newsletter.back-home")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm">{i18next.t("newsletter.confirm-intro", { email: inspect.data?.email })}</p>
            <ul className="text-sm list-disc pl-5">
              {inspect.data?.subscriptions.map((s, i) => (
                <li key={i}>{describe(s)}</li>
              ))}
            </ul>
            {confirm.isError && (
              <Alert appearance="warning">
                {confirm.error instanceof NewsletterApiError && confirm.error.status === 404
                  ? i18next.t("newsletter.confirm-invalid")
                  : i18next.t("newsletter.error-unavailable")}
              </Alert>
            )}
            <div>
              <Button onClick={() => confirm.mutate()} isLoading={confirm.isPending} disabled={confirm.isPending}>
                {i18next.t("newsletter.confirm-button")}
              </Button>
            </div>
            <p className="text-xs text-gray-500">{i18next.t("newsletter.confirm-not-you")}</p>
          </>
        )}
      </div>
    </div>
  );
}
