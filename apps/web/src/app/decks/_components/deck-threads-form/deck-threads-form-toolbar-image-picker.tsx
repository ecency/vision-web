import React, { useRef, useState } from "react";
import axios from "axios";
import { Button } from "@ui/button";
import { UilImage, UilLink, UilUpload } from "@tooni/iconscout-unicons-react";
import { ensureValidToken } from "@/utils";
import { uploadImage } from "@ecency/sdk";
import { error } from "@/features/shared";
import i18next from "i18next";
import { Tooltip } from "@ui/tooltip";
import { AddImage } from "@/features/shared/editor-toolbar/add-image";
import { GalleryDialog } from "@/features/shared/gallery";
import { EcencyConfigManager } from "@/config";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { convertHeicToJpeg } from "@/utils/convert-heic";
import { isAcceptedImageFilename } from "@/utils/image-upload-formats";

interface Props {
  onAddImage: (link: string, name: string) => void;
}

export const DeckThreadsFormToolbarImagePicker = ({ onAddImage }: Props) => {
  const { activeUser } = useActiveAccount();

  const fileInputRef = useRef<any>(null);

  const [imagePickInitiated, setImagePickInitiated] = useState(false);
  const [galleryPickInitiated, setGalleryPickInitiated] = useState(false);

  const onImagePick = (text: string, url: string) => {
    onAddImage(url, text);
  };

  const checkFile = (filename: string) => isAcceptedImageFilename(filename);

  const fileInputChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    let files = Array.from(e.target.files as FileList)
      .filter((i) => checkFile(i.name))
      .filter((i) => i);

    if (files.length > 0) {
      e.stopPropagation();
      e.preventDefault();
    }

    void (async () => {
      for (const file of files) {
        try {
          await upload(file);
        } catch {
          /* handled in upload */
        }
      }
    })();

    // reset input
    e.target.value = "";
  };

  const upload = async (file: File) => {
    const username = activeUser?.username!;
    let imageUrl: string;
    try {
      let token = await ensureValidToken(username);
      if (token) {
        const resp = await uploadImage(await convertHeicToJpeg(file), token);
        imageUrl = resp.url;
        onAddImage(imageUrl, file.name);
      } else {
        error(i18next.t("editor-toolbar.image-error-cache"));
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 413) {
        error(i18next.t("editor-toolbar.image-error-size"), undefined, { error: e });
      } else {
        error(i18next.t("editor-toolbar.image-error"), undefined, { error: e });
      }
      return;
    }
  };

  return (
    <div className="deck-threads-form-toolbar-image-picker">
      {activeUser && (
        <Tooltip content={i18next.t("editor-toolbar.image")}>
          <Dropdown>
            <DropdownToggle>
              <Button icon={<UilImage />} appearance="gray-link" noPadding={true} aria-label={i18next.t("editor-toolbar.image")} aria-haspopup="menu" />
            </DropdownToggle>
            <DropdownMenu>
              <DropdownItemWithIcon
                onClick={() => setImagePickInitiated(true)}
                icon={<UilLink />}
                label={i18next.t("editor-toolbar.link-image")}
              />
              <DropdownItemWithIcon
                onClick={(e) => {
                  e.stopPropagation();
                  const el = fileInputRef.current;
                  if (el) el.click();
                }}
                icon={<UilUpload />}
                label={i18next.t("editor-toolbar.upload")}
              />
              <EcencyConfigManager.Conditional
                condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
              >
                <DropdownItemWithIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    setGalleryPickInitiated(true);
                  }}
                  icon={<UilImage />}
                  label={i18next.t("editor-toolbar.gallery")}
                />
              </EcencyConfigManager.Conditional>
            </DropdownMenu>
          </Dropdown>
        </Tooltip>
      )}
      {imagePickInitiated && (
        <AddImage
          onHide={() => setImagePickInitiated(false)}
          onSubmit={(text: string, link: string) => {
            onImagePick(text, link);
            setImagePickInitiated(false);
          }}
        />
      )}
      {galleryPickInitiated && activeUser && (
        <GalleryDialog
          show={galleryPickInitiated}
          setShow={setGalleryPickInitiated}
          onPick={(url: string) => {
            const fileName = "";
            onImagePick(fileName, url);
            setGalleryPickInitiated(false);
          }}
        />
      )}
      <input
        onChange={fileInputChanged}
        className="file-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={true}
        style={{ display: "none" }}
      />
    </div>
  );
};
