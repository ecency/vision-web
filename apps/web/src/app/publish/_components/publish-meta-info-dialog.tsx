import { Modal, ModalBody, ModalFooter, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import React from "react";
import { usePublishState } from "@/app/publish/_hooks";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Alert } from "@ui/alert";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";

interface Props {
  show: boolean;
  setShow: (show: boolean) => void;
}

export function PublishMetaInfoDialog({ show, setShow }: Props) {
  const { metaDescription, editMetaDescription } = usePublishState();

  return (
    <Modal show={show} onHide={() => setShow(false)} centered={true}>
      <ModalHeader closeButton={true}>{i18next.t("submit.description")}</ModalHeader>
      <ModalBody>
        <Alert className="mb-4">{i18next.t("publish.description-hint")}</Alert>
        <FormControl
          type="textarea"
          value={metaDescription}
          onChange={(e) => editMetaDescription((e.target as HTMLTextAreaElement).value)}
          maxLength={SUBMIT_DESCRIPTION_MAX_LENGTH}
        />
      </ModalBody>
      <ModalFooter className="justify-end flex">
        <Button appearance="gray" onClick={() => setShow(false)} size="sm">
          {i18next.t("g.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
