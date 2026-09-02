"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error as toastError, success } from "@/features/shared";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Turnstile, TURNSTILE_SITEKEY, type TurnstileHandle } from "@/features/shared/turnstile";
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
  /**
   * Called once the service has accepted a subscribe, whether it went live or is waiting
   * on a confirmation. Callers that cannot read the subscription list back -- the post
   * prompt for an anonymous reader -- use this to stop offering it again.
   */
  onSubscribed?: () => void;
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
/**
 * What a failed subscribe says. Keyed on the relay's status: the service's own
 * codes ride in the body, but the status is what the transport preserves for
 * every failure, including the ones that never reached the service. 422 is the
 * tag offer gate (`tag_too_quiet`): the tag exists but too few people post
 * under it for a digest yet.
 */
export function subscribeErrorMessage(e: unknown): string {
  if (!(e instanceof NewsletterApiError)) return i18next.t("newsletter.error-generic");
  if (e.status === 503) return i18next.t("newsletter.error-unavailable");
  if (e.status === 502 || e.status === 504) return i18next.t("newsletter.error-gateway");
  if (e.status === 403) return i18next.t("newsletter.error-captcha");
  if (e.status === 429) return i18next.t("newsletter.error-too-many");
  if (e.status === 422) return i18next.t("newsletter.error-tag-quiet");
  return i18next.t("newsletter.error-generic");
}

export function DigestSubscribeDialog({
  type,
  target,
  targetLabel,
  source,
  show,
  onHide,
  onSubscribed
}: Props) {
  const { activeUser } = useActiveAccount();
  const { subscription, isLoading } = useDigestSubscription(type, target);
  const knownAddress = useKnownDigestAddress();
  const subscribe = useSubscribeDigest();
  const leave = useLeaveDigest();

  const [cadence, setCadence] = useState<DigestCadence>("weekly");
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<SubscribeResult | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Only an unproven caller is challenged, because only an unproven caller is challenged
  // by the route. Keyed on activeUser rather than on needsAddress, which is also true for
  // a signed-in person whose address the service has not learned yet: gating on that
  // would put a captcha in front of someone who already proved who they are.
  //
  // Being signed in locally is not quite the same as having a usable token, though.
  // ensureValidToken returns undefined when the refresh fails or the stored record is
  // gone, and newsletterApi.subscribe then omits `code`, so the request arrives anonymous
  // and 403s while the dialog shows no challenge to complete. A 403 is the server saying
  // it wanted one, so the widget appears on that answer regardless of activeUser.
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const needsCaptcha = !activeUser || captchaRequired;

  // Tokens are single use, so a spent one must never survive into the next attempt.
  const resetCaptcha = () => {
    setCaptchaToken("");
    turnstileRef.current?.reset();
  };

  // Reset only when the dialog OPENS. Subscribing invalidates the subscriptions
  // query, and a reset keyed on the refetched subscription would wipe the
  // "check your inbox" outcome the person is reading.
  useEffect(() => {
    if (show) {
      setCadence(subscription?.cadence ?? "weekly");
      setEmail(subscription?.email ?? knownAddress ?? "");
      setOutcome(null);
      setCaptchaToken("");
      setCaptchaRequired(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  // But do follow the address once it becomes known while open (first load).
  useEffect(() => {
    if (show && !subscription && knownAddress) setEmail((e) => e || knownAddress);
  }, [show, subscription, knownAddress]);

  const needsAddress = !subscription && !knownAddress;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const busy = subscribe.isPending || leave.isPending;
  const pending = subscription?.status === "pending_confirmation";
  // Update is meaningful when the cadence changes; for a pending subscription the
  // same call re-sends the confirmation, so it is offered under that name.
  const cadenceUnchanged = Boolean(subscription) && cadence === subscription?.cadence;
  const primaryLabel = !subscription
    ? i18next.t("newsletter.subscribe")
    : pending && cadenceUnchanged
      ? i18next.t("newsletter.resend")
      : i18next.t("newsletter.update");
  const primaryDisabled =
    busy ||
    isLoading ||
    (needsAddress && !emailValid) ||
    (cadenceUnchanged && !pending) ||
    (needsCaptcha && !captchaToken);

  const cadenceLabel = (c: DigestCadence) => i18next.t(`newsletter.cadence.${c}`);
  const digestName = useMemo(
    () =>
      type === "own"
        ? i18next.t("newsletter.own-digest")
        : type === "site"
          ? i18next.t("newsletter.site-digest")
          : type === "community"
            ? i18next.t("newsletter.community-digest", { name: targetLabel })
            : type === "tag"
              ? i18next.t("newsletter.tag-digest", { name: targetLabel })
              : i18next.t("newsletter.creator-digest", { name: targetLabel }),
    [type, targetLabel]
  );

  const submit = async () => {
    try {
      const result = await subscribe.mutateAsync({
        email: (subscription?.email ?? email).trim(),
        type,
        target,
        cadence,
        source,
        ...(needsCaptcha ? { captchaToken } : {})
      });
      setOutcome(result);
      if (result.status === "active" || result.status === "pending_confirmation") onSubscribed?.();
      if (result.status === "active") {
        success(
          subscription
            ? i18next.t("newsletter.updated", { cadence: cadenceLabel(cadence) })
            : i18next.t("newsletter.subscribed")
        );
      } else if (result.status === "pending_confirmation" && pending && cadenceUnchanged) {
        success(i18next.t("newsletter.resent"));
      }
    } catch (e) {
      if (e instanceof NewsletterApiError && e.status === 403) setCaptchaRequired(true);
      toastError(subscribeErrorMessage(e));
      resetCaptcha();
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
              {i18next.t("newsletter.check-inbox", {
                email: (subscription?.email ?? email).trim()
              })}
              {outcome.confirmationSent === false && (
                <div className="mt-1 text-xs opacity-80">
                  {i18next.t("newsletter.recently-sent")}
                </div>
              )}
            </Alert>
          ) : outcome?.status === "refused" ? (
            <Alert appearance="warning">
              {i18next.t("newsletter.refused")}
              <div className="mt-2">
                <Button
                  size="sm"
                  appearance="gray-link"
                  onClick={() => {
                    setOutcome(null);
                    if (needsCaptcha) resetCaptcha();
                  }}
                >
                  {i18next.t("newsletter.try-again")}
                </Button>
              </div>
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
              {type === "own"
                ? i18next.t("newsletter.intro-own")
                : type === "site"
                  ? i18next.t("newsletter.intro-site")
                  : type === "community"
                    ? i18next.t("newsletter.intro-community", { name: targetLabel })
                    : type === "tag"
                      ? i18next.t("newsletter.intro-tag", { name: targetLabel })
                      : i18next.t("newsletter.intro-creator", { name: targetLabel })}
            </p>
          )}

          {outcome?.status !== "pending_confirmation" && outcome?.status !== "refused" && (
            <>
              <div>
                <label htmlFor="digest-cadence" className="text-sm px-2 mb-2 block">
                  {i18next.t("newsletter.cadence-label")}
                </label>
                <FormControl
                  id="digest-cadence"
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
                  <label htmlFor="digest-email" className="text-sm px-2 mb-2 block">
                    {i18next.t("newsletter.email-label")}
                  </label>
                  <FormControl
                    id="digest-email"
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

              {needsCaptcha && (
                <Turnstile
                  ref={turnstileRef}
                  sitekey={TURNSTILE_SITEKEY}
                  action="newsletter-subscribe"
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  onError={() => setCaptchaToken("")}
                  className="px-2"
                />
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 px-2">
                {i18next.t("newsletter.disclosure")}
                {type === "creator" &&
                  " " + i18next.t("newsletter.disclosure-creator", { name: targetLabel })}
              </p>

              <div className="flex flex-wrap gap-2 items-center">
                <Button onClick={submit} disabled={primaryDisabled} isLoading={subscribe.isPending}>
                  {primaryLabel}
                </Button>
                {subscription && (
                  <Button
                    appearance="danger"
                    outline={true}
                    onClick={doLeave}
                    disabled={busy}
                    isLoading={leave.isPending}
                  >
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
