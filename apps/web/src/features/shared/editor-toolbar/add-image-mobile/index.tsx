import React from "react";
import { proxifyImageSrc, setProxyBase } from "@ecency/render-helper";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Button } from "@ui/button";
import i18next from "i18next";
import { getImagesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import defaults from "@/defaults";
import { EcencyConfigManager } from "@/config";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken } from "@/utils";

setProxyBase(defaults.imageServer);

interface Props {
  onHide: () => void;
  onPick: (url: string) => void;
  onGallery: () => void;
  onUpload: () => void;
}

export function AddImageMobile({ onHide, onPick, onUpload, onGallery }: Props) {
  const { activeUser } = useActiveAccount();
  const { data: items } = useQuery({
    ...getImagesQueryOptions(activeUser?.username, getAccessToken(activeUser?.username ?? "")),
    select: (items: any[]) =>
      items.sort((a, b) => {
        return new Date(b.created).getTime() > new Date(a.created).getTime() ? 1 : -1;
      })
  });

  return (
    <Modal show={true} centered={true} onHide={onHide} className="add-image-mobile-modal">
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("add-image-mobile.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {items && items.length > 0 && (
          <div className="dialog-content">
            <div className="recent-list">
              <div className="recent-list-title">{i18next.t("add-image-mobile.recent-title")}</div>
              <div className="recent-list-body">
                {items.map((item) => {
                  const src = proxifyImageSrc(item.url, 600, 500);
                  return (
                    <div
                      className="recent-list-item"
                      style={{ backgroundImage: `url('${src}')` }}
                      key={item._id}
                      role="button"
                      tabIndex={0}
                      aria-label={i18next.t("add-image-mobile.recent-title", { defaultValue: "Recent image" })}
                      onClick={() => {
                        onPick(item.url);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPick(item.url);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between">
              <EcencyConfigManager.Conditional
                condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
              >
                <Button onClick={onGallery}>{i18next.t("add-image-mobile.gallery")}</Button>
              </EcencyConfigManager.Conditional>
              <EcencyConfigManager.Conditional
                condition={({ visionFeatures }) => visionFeatures.imageServer.enabled}
              >
                <Button onClick={onUpload}>{i18next.t("add-image-mobile.upload")}</Button>
              </EcencyConfigManager.Conditional>
            </div>
          </div>
        )}
        {items?.length === 0 && (
          <div className="dialog-content">
            <div className="recent-list" />
            <div className="flex justify-center">
              <Button onClick={onUpload}>{i18next.t("add-image-mobile.upload")}</Button>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
