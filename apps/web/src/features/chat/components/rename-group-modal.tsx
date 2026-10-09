"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import i18next from "i18next";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { useMattermostRenameGroup } from "../mattermost-api";

/** Matches the server's limit in chat-group-name. */
export const GROUP_NAME_MAX_LENGTH = 64;

interface RenameGroupModalProps {
  show: boolean;
  onHide: () => void;
  channelId: string;
  currentName?: string;
}

export function RenameGroupModal({ show, onHide, channelId, currentName }: RenameGroupModalProps) {
  const [name, setName] = useState(currentName ?? "");
  const rename = useMattermostRenameGroup();

  useEffect(() => {
    if (show) {
      setName(currentName ?? "");
      rename.reset();
    }
    // Start from the saved name each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const trimmed = name.trim();
  const unchanged = trimmed === (currentName ?? "").trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (unchanged || rename.isPending) return;
    rename.mutate({ channelId, name: trimmed }, { onSuccess: onHide });
  };

  return (
    <Modal show={show} onHide={onHide} centered size="sm">
      <ModalHeader closeButton={true}>{i18next.t("chat.rename-group")}</ModalHeader>
      <ModalBody>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <p className="text-xs text-[--text-muted]">{i18next.t("chat.rename-group-hint")}</p>
          <FormControl
            type="text"
            aria-label={i18next.t("chat.group-name")}
            placeholder={i18next.t("chat.group-name")}
            value={name}
            maxLength={GROUP_NAME_MAX_LENGTH}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            autoFocus={true}
          />

          {rename.error && (
            <div className="text-sm text-red-500" role="alert">
              {(rename.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button appearance="secondary" type="button" onClick={onHide}>
              {i18next.t("g.cancel")}
            </Button>
            <Button type="submit" disabled={unchanged || rename.isPending}>
              {rename.isPending ? i18next.t("chat.rename-group-saving") : i18next.t("g.save")}
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}
