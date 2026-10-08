import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error } from "@/features/shared";
import {
  Button,
  KeyInput,
  KeyInputImperativeHandle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader
} from "@/features/ui";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { deriveHiveMasterPasswordKeys } from "@ecency/wallets";
import { PublicKey } from "@ecency/sdk";
import { isWif } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useCallback, useRef, useState } from "react";
import { useRevealedKeysStore } from "../_hooks";

interface Props {
  show: boolean;
  setShow: (v: boolean) => void;
}

export function ManageKeyPasswordDialog({ show, setShow }: Props) {
  const { activeUser } = useActiveAccount();

  const keyInputRef = useRef<KeyInputImperativeHandle>(null);

  const { data } = useQuery({
    ...getAccountFullQueryOptions(activeUser?.username ?? ""),
    select: (resp) =>
      resp
        ? {
            // Every owner key: after a key rotation the account holds the old
            // and the new owner key, and key_auths is sorted by key, so the
            // master password being checked may derive either of them.
            ownerKeys: resp.owner.key_auths.map(([key]) => String(key))
          }
        : null
  });
  const { updateKeys } = useRevealedKeysStore();

  const handleSubmit = useCallback(async () => {
    const result = await keyInputRef.current!.handleSign();

    // KeyInput already showed the relevant error toast for a missing/invalid key.
    if (!result) {
      return;
    }

    const { raw } = result;

    try {
      PublicKey.fromString(raw);
      error(i18next.t("login.error-public-key"));
      return;
    } catch (e) {}

    if (isWif(raw)) {
      error(i18next.t("permissions.keys.error-private-key-reveal"));
    } else {
      const keys = deriveHiveMasterPasswordKeys(activeUser!.username, raw);

      if (!data?.ownerKeys.includes(keys.ownerPubkey)) {
        error(i18next.t("login.error-authenticate")); // enter master or active key
        return;
      }

      updateKeys(activeUser!.username, {
        [keys.ownerPubkey]: keys.owner,
        [keys.activePubkey]: keys.active,
        [keys.postingPubkey]: keys.posting,
        [keys.memoPubkey]: keys.memo
      });
    }

    setShow(false);
  }, [activeUser, data?.ownerKeys, setShow, updateKeys]);

  return (
    <Modal show={show} onHide={() => setShow(false)} centered={true}>
      <ModalHeader closeButton={true}>{i18next.t("manage-authorities.password-title")}</ModalHeader>
      <ModalBody>
        <div className="text-sm opacity-75 mb-4">
          {i18next.t("manage-authorities.password-sub-title")}
        </div>

        <KeyInput ref={keyInputRef} autoFocus={true} autoComplete="off" />
      </ModalBody>
      <ModalFooter className="flex justify-end">
        <Button onClick={handleSubmit}>{i18next.t("g.continue")}</Button>
      </ModalFooter>
    </Modal>
  );
}
