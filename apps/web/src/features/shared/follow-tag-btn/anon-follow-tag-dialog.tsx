"use client";

import { useGlobalStore } from "@/core/global-store";
import { DigestSubscribeDialog } from "@/features/newsletter";
import { NewsletterGate } from "@/features/newsletter/runtime";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import { useState } from "react";

interface Props {
  /** Normalised tag. */
  tag: string;
  show: boolean;
  onHide: () => void;
}

/**
 * What a signed-out reader gets from a tag chip's follow control: following
 * needs an account, so the first choice is to log in; the second, when the
 * newsletter is on, is the tag's email digest, which needs no account. The
 * email choice hands over to the digest dialog and closes this one.
 */
export function AnonFollowTagDialog({ tag, show, onHide }: Props) {
  const toggleUiProp = useGlobalStore((state) => state.toggleUiProp);
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <>
      {!emailOpen && (
        <Modal show={show} onHide={onHide} centered={true} size="sm">
          <ModalHeader closeButton={true}>
            <ModalTitle>{i18next.t("follow-tag.anon-title", { tag })}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {i18next.t("follow-tag.anon-body")}
              </p>
              <Button
                appearance="primary"
                onClick={() => {
                  onHide();
                  toggleUiProp("login");
                }}
              >
                {i18next.t("follow-tag.anon-login")}
              </Button>
              <NewsletterGate>
                <Button appearance="gray" onClick={() => setEmailOpen(true)}>
                  {i18next.t("newsletter.button-tag", { name: tag })}
                </Button>
              </NewsletterGate>
            </div>
          </ModalBody>
        </Modal>
      )}
      {emailOpen && (
        <DigestSubscribeDialog
          type="tag"
          target={tag}
          targetLabel={`#${tag}`}
          source="tag-chip"
          show={emailOpen}
          onHide={() => {
            setEmailOpen(false);
            onHide();
          }}
        />
      )}
    </>
  );
}
