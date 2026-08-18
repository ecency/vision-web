"use client";

import {
  CADENCES,
  DigestCadence,
  DigestSubscription,
  describeDigest,
  useDigestSubscriptions,
  useLeaveDigest,
  useNewsletterEnabled,
  useSubscribeDigest,
  useUnsubscribeAllDigests
} from "@/features/newsletter";
import { error as toastError, success } from "@/features/shared";
import { UilEnvelope } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { ModalConfirm } from "@ui/modal-confirm";
import i18next from "i18next";
import Link from "next/link";
import { useState } from "react";

/**
 * The one place a person sees every digest they receive by email, changes a cadence,
 * leaves one, or stops all Ecency email to that address. Deep-linkable as
 * #email-digests from the subscribe dialog.
 */
export function EmailDigestsSettings() {
  const enabled = useNewsletterEnabled();
  const { data, isLoading, isError } = useDigestSubscriptions();
  const subscribe = useSubscribeDigest();
  const leave = useLeaveDigest();
  const stopAll = useUnsubscribeAllDigests();
  const [confirmStopAll, setConfirmStopAll] = useState<string | null>(null);

  if (!enabled) return null;

  const subscriptions = data ?? [];
  const addresses = Array.from(new Set(subscriptions.map((s) => s.email)));

  const describe = (s: DigestSubscription) => describeDigest(s.type, s.target);

  const changeCadence = async (s: DigestSubscription, cadence: DigestCadence) => {
    if (s.type === "own") return;
    try {
      await subscribe.mutateAsync({
        email: s.email,
        type: s.type,
        target: s.target,
        cadence,
        source: "settings"
      });
      success(i18next.t("newsletter.updated", { cadence: i18next.t(`newsletter.cadence.${cadence}`) }));
    } catch {
      toastError(i18next.t("newsletter.error-generic"));
    }
  };

  const leaveOne = async (s: DigestSubscription) => {
    try {
      await leave.mutateAsync(s.id);
      success(i18next.t("newsletter.left"));
    } catch {
      toastError(i18next.t("newsletter.error-generic"));
    }
  };

  const doStopAll = async (email: string) => {
    setConfirmStopAll(null);
    try {
      await stopAll.mutateAsync(email);
      success(i18next.t("newsletter.stopped-all", { email }));
    } catch {
      toastError(i18next.t("newsletter.error-generic"));
    }
  };

  return (
    <div id="email-digests" className="bg-white dark:bg-gray-800 rounded-xl p-3 flex flex-col gap-4 scroll-mt-20">
      <div className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
        <UilEnvelope className="size-4" aria-hidden="true" />
        {i18next.t("newsletter.settings-title")}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-2">{i18next.t("g.loading")}</p>
      ) : isError ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-2">{i18next.t("newsletter.error-unavailable")}</p>
      ) : subscriptions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-2">
          {i18next.t("newsletter.settings-empty")}{" "}
          <Link href="/communities" className="text-blue-dark-sky">
            {i18next.t("newsletter.settings-empty-link")}
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[--border-color]">
          {subscriptions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 px-2">
              <div className="flex-1 min-w-[10rem]">
                <div className="text-sm">{describe(s)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {s.email}
                  {s.status === "pending_confirmation" && (
                    <span className="ml-2 text-orange">{i18next.t("newsletter.status-pending-short")}</span>
                  )}
                  {s.status === "suppressed" && (
                    <span className="ml-2 text-red">{i18next.t("newsletter.status-suppressed-short")}</span>
                  )}
                </div>
              </div>
              {s.type !== "own" && (
                <FormControl
                  type="select"
                  value={s.cadence}
                  disabled={subscribe.isPending}
                  className="!w-auto"
                  aria-label={i18next.t("newsletter.cadence-label")}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    changeCadence(s, e.target.value as DigestCadence)
                  }
                >
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {i18next.t(`newsletter.cadence.${c}`)}
                    </option>
                  ))}
                </FormControl>
              )}
              <Button size="sm" appearance="danger" outline={true} disabled={leave.isPending} onClick={() => leaveOne(s)}>
                {i18next.t("newsletter.leave")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {addresses.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center px-2">
          {addresses.map((email) => (
            <Button
              key={email}
              size="sm"
              appearance="gray-link"
              disabled={stopAll.isPending}
              onClick={() => setConfirmStopAll(email)}
            >
              {i18next.t("newsletter.stop-all", { email })}
            </Button>
          ))}
        </div>
      )}

      {confirmStopAll && (
        <ModalConfirm
          titleText={i18next.t("newsletter.stop-all-title")}
          descriptionText={i18next.t("newsletter.stop-all-desc", { email: confirmStopAll })}
          okVariant="danger"
          okText={i18next.t("newsletter.stop-all-ok")}
          onConfirm={() => doStopAll(confirmStopAll)}
          onCancel={() => setConfirmStopAll(null)}
        />
      )}
    </div>
  );
}
