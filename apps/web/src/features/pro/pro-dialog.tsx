"use client";

import { QueryKeys, type ProMembersResponse } from "@ecency/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@ui/alert";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import { useState } from "react";
import { ProCheckout } from "./pro-checkout";
import { ProBlogClaim } from "./pro-blog-claim";

interface Props {
  /** The authenticated buyer. */
  username: string;
  onHide: () => void;
  /** Set when reopened after a redirect-based payment return, to resume the grant poll. */
  resumePaymentIntent?: string;
}

/**
 * Ecency Pro purchase dialog. Dynamically imported from the perks hub (ssr:false) so
 * @stripe/stripe-js stays out of the perks bundle until the user opens it.
 */
export function ProDialog({ username, onHide, resumePaymentIntent }: Props) {
  const [done, setDone] = useState(false);
  // True while a Pay submit is in flight (validate, mint, confirm). The dialog must not
  // close in that window: once confirmPayment is dispatched the charge can complete
  // server side; a closed dialog would offer the buyer a fresh checkout for a
  // payment that already went through. A decline flips this back to false.
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // On activation, reflect the new membership immediately. The /perks card and every ProBadge
  // read the shared pro-members roster, so without this a just-paid user would still see "Go Pro"
  // and no badge. Cancel any in-flight roster fetch first so a stale (edge-cached, pre-grant)
  // response can't land after this write and clobber the optimistic entry. We then optimistically
  // add them but deliberately do NOT invalidate/refetch: the endpoint is edge-cached (~5 min) and
  // would return the pre-grant list. setQueryData marks the query fresh, so it won't refetch until
  // the stale window elapses, by which point the grant and the endpoint cache have caught up.
  const handleActivated = async () => {
    setDone(true);
    await queryClient.cancelQueries({ queryKey: QueryKeys.accounts.proMembers() });
    queryClient.setQueryData<ProMembersResponse>(QueryKeys.accounts.proMembers(), (prev) => {
      const members = prev?.members ?? [];
      if (members.includes(username)) return prev;
      return { members: [...members, username], count: (prev?.count ?? 0) + 1 };
    });
  };

  // Redirect-based methods send the buyer to /perks and Stripe re-appends payment_intent; the
  // perks page reopens this dialog to resume, so anchor the returnUrl there with a marker.
  const returnUrl = typeof window !== "undefined" ? `${window.location.origin}/perks?pro=1` : "";

  return (
    // dismissViaOnHide routes the close button, backdrop and Escape through onHide, so
    // the submitting guard below actually decides whether the dialog closes.
    <Modal
      show={true}
      centered={true}
      onHide={() => {
        // No close while a Pay submit is in flight: the confirm may already have charged
        // the card and the buyer must stay on this dialog to see the outcome.
        if (submitting) {
          return;
        }
        onHide();
      }}
      dismissViaOnHide={true}
      size="md"
    >
      <ModalHeader closeButton={true}>{i18next.t("pro.title")}</ModalHeader>
      <ModalBody>
        {done ? (
          <div className="flex flex-col gap-4">
            <Alert appearance="success">
              <div className="flex flex-col gap-1">
                <strong>{i18next.t("pro.success-title")}</strong>
                <span>{i18next.t("pro.success-body")}</span>
              </div>
            </Alert>
            {/* Ecency Pro bundles a free blog -> let the new member claim it right away. */}
            <ProBlogClaim username={username} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="opacity-75 text-sm">{i18next.t("pro.subtitle")}</p>
            <ul className="text-sm flex flex-col gap-1 list-disc pl-5">
              <li>{i18next.t("pro.benefit-badge")}</li>
              <li>{i18next.t("pro.benefit-blog")}</li>
              <li>{i18next.t("pro.benefit-support")}</li>
              <li>{i18next.t("pro.benefit-early")}</li>
            </ul>
            <ProCheckout
              username={username}
              returnUrl={returnUrl}
              resumePaymentIntent={resumePaymentIntent}
              onActivated={handleActivated}
              onSubmittingChange={setSubmitting}
            />
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

export default ProDialog;
