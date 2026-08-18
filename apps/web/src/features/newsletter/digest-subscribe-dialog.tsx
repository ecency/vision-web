"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error as toastError, success } from "@/features/shared";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CADENCES,
  useDigestSubscription,
  useKnownDigestAddress,
  useLeaveDigest,
  useSubscribeDigest
} from "./hooks";
import { NewsletterApiError } from "./newsletter-api";
import type { DigestCadence, DigestType, SubscribeInput, SubscribeResult } from "./types";

interface Props {
  type: DigestType;
  target: string;
  /** Human name for the copy: community title or creator name. */
  targetLabel: string;
  source: SubscribeInput["source"];
  show: boolean;
  onHide: () => void;
}

/**
 * One dialog for the whole lifecycle of a digest subscription: subscribe, see the current
 * state, change cadence, leave. It reads the logged-in account's subscriptions from the
 * service, so a person who joined here sees the same state anywhere the control renders,
 * and in settings.
 *
 * Anonymous visitors get the address-collecting flow; the service double opts them in.
 * Logged-in visitors are asked for an address only until the service holds one for the
 * account (learned from any live subscription), after which subscribing is one action
 * IF the address owner has confirmed a request from this account before (the service
 * calls that "proven"). Until then the service replies with a bare
 * `{ status: "pending_confirmation" }`, and the dialog shows the check-your-inbox state
 * without assuming any of the richer fields a proven caller receives.
 */
export function DigestSubscribeDialog({ type, target, targetLabel, source, show, onHide }: Props) {
  const { activeUser } = useActiveAccount();
  const { subscription, isLoading } = useDigestSubscription(type, target);
  const knownAddress = useKnownDigestAddress();
  const subscribe = useSubscribeDigest();
  const leave = useLeaveDigest();

  const [cadence, setCadence] = useState<DigestCadence>("weekly");
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<SubscribeResult | null>(null);

  useEffect(() => {
    if (show) {
      setCadence(subscription?.cadence ?? "weekly");
      setEmail(subscription?.email ?? knownAddress ?? "");
      setOutcome(null);
    }
    // Reset when the dialog opens or the subscription it shows changes.
  }, [show, subscription?.id, subscription?.cadence, subscription?.email, knownAddress]);

  const needsAddress = !subscription && !knownAddress;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const busy = subscribe.isPending || leave.isPending;

  const cadenceLabel = (c: DigestCadence) => i18next.t(`newsletter.cadence.${c}`);
  const digestName = useMemo(
    () =>
      type === "community"
        ? i18next.t("newsletter.community-digest", { name: targetLabel })
        : i18next.t("newsletter.creator-digest", { name: targetLabel }),
    [type, targetLabel]
  );

  const submit = async () => {
    try {
      const result = await subscribe.mutateAsync({
        email: (subscription?.email ?? email).trim(),
        type,
        target,
        targetLabel,
        cadence,
        source
      });
      setOutcome(result);
      if (result.status === "active") {
        success(
          subscription
            ? i18next.t("newsletter.updated", { cadence: cadenceLabel(cadence) })
            : i18next.t("newsletter.subscribed")
        );
      }
    } catch (e) {
      const message =
        e instanceof NewsletterApiError && e.status === 403
          ? i18next.t("newsletter.error-not-pro")
          : e instanceof NewsletterApiError && e.status === 503
            ? i18next.t("newsletter.error-unavailable")
            : i18next.t("newsletter.error-generic");
      toastError(message);
    }
  };

  const doLeave = async () => {
    if (!subscription) return;
    try {
      await leave.mutateAsync(subscription.id);
      success(i18next.t("newsletter.left"));
      onHide();
    } catch {
      toastError(i18next.t("newsletter.error-generic"));
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered={true} size="md">
      <ModalHeader closeButton={true}>
        <ModalTitle>{digestName}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4">
          {outcome?.status === "pending_confirmation" ? (
            <Alert appearance="success">
              {i18next.t("newsletter.check-inbox", { email: (subscription?.email ?? email).trim() })}
              {outcome.confirmationSent === false && (
                <div className="mt-1 text-xs opacity-80">{i18next.t("newsletter.recently-sent")}</div>
              )}
            </Alert>
          ) : outcome?.status === "refused" ? (
            <Alert appearance="warning">
              {activeUser ? i18next.t("newsletter.refused") : i18next.t("newsletter.refused-anon")}
            </Alert>
          ) : subscription ? (
            <Alert appearance={subscription.status === "active" ? "success" : "primary"}>
              {subscription.status === "active"
                ? i18next.t("newsletter.status-active", {
                    cadence: cadenceLabel(subscription.cadence),
                    email: subscription.email
                  })
                : subscription.status === "pending_confirmation"
                  ? i18next.t("newsletter.status-pending", { email: subscription.email })
                  : i18next.t("newsletter.status-suppressed")}
            </Alert>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {type === "community"
                ? i18next.t("newsletter.intro-community", { name: targetLabel })
                : i18next.t("newsletter.intro-creator", { name: targetLabel })}
            </p>
          )}

          {outcome?.status !== "pending_confirmation" && outcome?.status !== "refused" && (
            <>
              <div>
                <label className="text-sm px-2 mb-2 block">{i18next.t("newsletter.cadence-label")}</label>
                <FormControl
                  type="select"
                  value={cadence}
                  disabled={busy || isLoading}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setCadence(e.target.value as DigestCadence)
                  }
                >
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {cadenceLabel(c)}
                    </option>
                  ))}
                </FormControl>
              </div>

              {needsAddress && (
                <div>
                  <label className="text-sm px-2 mb-2 block">{i18next.t("newsletter.email-label")}</label>
                  <FormControl
                    type="email"
                    value={email}
                    disabled={busy}
                    autoComplete="email"
                    placeholder="you@example.com"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 px-2 mt-2">
                    {i18next.t("newsletter.email-hint")}
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 px-2">
                {i18next.t("newsletter.disclosure")}
                {type === "creator" && " " + i18next.t("newsletter.disclosure-creator", { name: targetLabel })}
              </p>

              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  onClick={submit}
                  disabled={busy || isLoading || (needsAddress && !emailValid) || (Boolean(subscription) && cadence === subscription?.cadence)}
                  isLoading={subscribe.isPending}
                >
                  {subscription ? i18next.t("newsletter.update") : i18next.t("newsletter.subscribe")}
                </Button>
                {subscription && (
                  <Button appearance="danger" outline={true} onClick={doLeave} disabled={busy} isLoading={leave.isPending}>
                    {i18next.t("newsletter.leave")}
                  </Button>
                )}
                {activeUser && (
                  <Link
                    href={`/@${activeUser.username}/settings#email-digests`}
                    className="text-sm text-blue-dark-sky ml-auto"
                    onClick={onHide}
                  >
                    {i18next.t("newsletter.manage-all")}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
