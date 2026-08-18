"use client";

import { isProMember } from "@/features/pro";
import { getProMembersQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilEnvelope, UilEnvelopeCheck } from "@tooni/iconscout-unicons-react";
import { Button, ButtonProps } from "@ui/button";
import i18next from "i18next";
import { useState } from "react";
import { DigestSubscribeDialog } from "./digest-subscribe-dialog";
import { useDigestSubscription, useNewsletterEnabled } from "./hooks";
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
 * Renders nothing when the feature is off (call sites also wrap it in
 * EcencyConfigManager.Conditional, the house pattern; this is the belt to that brace),
 * and, for creators, when the creator is not an Ecency Pro member: creator lists are a
 * Pro capability, and the server enforces the same rule, this only avoids offering
 * something the request would refuse.
 */
export function DigestSubscribeButton({ type, target, targetLabel, source, size, className }: Props) {
  const enabled = useNewsletterEnabled();
  const [open, setOpen] = useState(false);
  const { subscription } = useDigestSubscription(type, target);
  const { data: pro } = useQuery({ ...getProMembersQueryOptions(), enabled: enabled && type === "creator" });

  if (!enabled) return null;
  if (type === "creator" && !isProMember(pro?.members, target)) return null;

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
