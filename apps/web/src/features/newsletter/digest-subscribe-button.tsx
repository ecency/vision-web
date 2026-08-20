"use client";

import { UilEnvelope, UilEnvelopeCheck } from "@tooni/iconscout-unicons-react";
import { Button, ButtonProps } from "@ui/button";
import i18next from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { SUBSCRIBE_PARAM, SUBSCRIBE_PARAM_VALUE } from "./list-building";
import { DigestSubscribeDialog } from "./digest-subscribe-dialog";
import { useDigestSubscription } from "./hooks";
import { useNewsletterEnabled } from "./runtime";
import type { DigestType, SubscribeInput } from "./types";

interface Props {
  type: DigestType;
  target: string;
  targetLabel: string;
  source: SubscribeInput["source"];
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * The entry point on a community page or a creator profile. Shows the current state when
 * the logged-in account holds a subscription, opens the dialog for everything else.
 * Renders nothing when the feature is off (call sites also wrap it in NewsletterGate,
 * the runtime counterpart of EcencyConfigManager.Conditional; this is the belt to that brace).
 * Every creator is offered a list (decided 2026-08-19), so no per-account eligibility is
 * looked up here and whether the button appears is known on the first render. Ecency Pro
 * gates sending a post to a list and composing an issue, never subscribing to one.
 */
/**
 * A shared subscribe link (?subscribe=digest, vision-web#1537) opens the dialog
 * once, on the page that carries the list's button, then leaves the URL clean.
 * Reads the location and cleans it with history.replaceState (which Next keeps
 * in sync with the router), so it needs neither the app router nor a Suspense
 * boundary; a button rendered outside a Next page still works.
 */
function useSubscribeLinkOpener(onOpen: (() => void) | null): void {
  const opened = useRef(false);
  useEffect(() => {
    // null when the button is not shown here: leave the link alone and touch
    // nothing, the reader may be on a page that carries no list. A function:
    // open once, then clean the URL.
    if (!onOpen || opened.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(SUBSCRIBE_PARAM) !== SUBSCRIBE_PARAM_VALUE) return;
    opened.current = true;
    onOpen();
    params.delete(SUBSCRIBE_PARAM);
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, [onOpen]);
}

export function DigestSubscribeButton({ type, target, targetLabel, source, size, className }: Props) {
  const enabled = useNewsletterEnabled();
  const [open, setOpen] = useState(false);
  const { subscription } = useDigestSubscription(type, target);
  // Every creator has a list, so being offered one is just the feature flag,
  // which is why the shared-link opener can act on the first render.
  const offered = enabled;
  const openFromLink = useCallback(() => setOpen(true), []);
  useSubscribeLinkOpener(offered ? openFromLink : null);

  if (!offered) return null;

  const active = subscription?.status === "active";
  const label = subscription
    ? active
      ? i18next.t("newsletter.button-subscribed", {
          cadence: i18next.t(`newsletter.cadence.${subscription.cadence}`)
        })
      : i18next.t("newsletter.button-pending")
    : i18next.t("newsletter.button");

  return (
    <>
      <Button
        appearance={subscription ? "success" : "primary"}
        outline={Boolean(subscription)}
        size={size}
        className={className}
        iconPlacement="left"
        icon={active ? <UilEnvelopeCheck aria-hidden="true" /> : <UilEnvelope aria-hidden="true" />}
        onClick={() => setOpen(true)}
        title={i18next.t("newsletter.button-title")}
      >
        {label}
      </Button>
      {open && (
        <DigestSubscribeDialog
          type={type}
          target={target}
          targetLabel={targetLabel}
          source={source}
          show={open}
          onHide={() => setOpen(false)}
        />
      )}
    </>
  );
}
