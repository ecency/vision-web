import React, { useCallback, useRef, useState } from "react";
import { Button } from "@ui/button";
import { UilImage, UilLink, UilUpload } from "@tooni/iconscout-unicons-react";
import { uploadImageWithRetryPrompt } from "@/api/sdk-mutations/upload-image-retry";
import { error } from "@/features/shared";
import i18next from "i18next";
import { AddImage } from "@/features/shared/editor-toolbar/add-image";
import { GalleryDialog } from "@/features/shared/gallery";
import { EcencyConfigManager } from "@/config";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { convertHeicToJpeg } from "@/utils/convert-heic";
import { isAcceptedImageFilename } from "@/utils/image-upload-formats";

interface Props {
  onAddImage: (link: string, name: string) => void;
  disabled?: boolean;
}

export const WaveFormToolbarImagePicker = ({ onAddImage, disabled }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { activeUser } = useActiveAccount();

  const [imagePickInitiated, setImagePickInitiated] = useState(false);
  const [galleryPickInitiated, setGalleryPickInitiated] = useState(false);

  const handleImagePick = useCallback(
    (text: string, url: string) => {
      onAddImage(url, text);
    },
    [onAddImage]
  );

  const checkFile = useCallback((filename: string) => isAcceptedImageFilename(filename), []);

  const upload = useCallback(
    async (file: File) => {
      // captured now: a Retry later still uploads as the account that picked the file
      const username = activeUser?.username!;
      let convertedFile: File;
      try {
        convertedFile = await convertHeicToJpeg(file);
      } catch (e) {
        error(i18next.t("editor-toolbar.image-error"), undefined, { error: e });
        return;
      }
      // a Retry is awaited here, so the next picked file waits and order holds
      const url = await uploadImageWithRetryPrompt(convertedFile, username);
      if (url) {
        onAddImage(url, file.name);
      }
    },
    [activeUser?.username, onAddImage]
  );

  const fileInputChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [checkFile, upload]
  );

  return (
    <div className="deck-threads-form-toolbar-image-picker">
      {activeUser && !disabled && (
        <Dropdown>
          <DropdownToggle>
            <Button
              title={i18next.t("editor-toolbar.image")}
              icon={<UilImage />}
              appearance="gray-link"
              noPadding={true}
            />
          </DropdownToggle>
          <DropdownMenu>
            <DropdownItemWithIcon
              onClick={() => setImagePickInitiated(true)}
              icon={<UilLink />}
              label={i18next.t("editor-toolbar.link-image")}
            />
            <DropdownItemWithIcon
              onClick={(e: React.MouseEvent<HTMLElement>) => {
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
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  e.stopPropagation();
                  setGalleryPickInitiated(true);
                }}
                icon={<UilImage />}
                label={i18next.t("editor-toolbar.gallery")}
              />
            </EcencyConfigManager.Conditional>
          </DropdownMenu>
        </Dropdown>
      )}
      {imagePickInitiated && (
        <AddImage
          onHide={() => setImagePickInitiated(false)}
          onSubmit={(text: string, link: string) => {
            handleImagePick(text, link);
            setImagePickInitiated(false);
          }}
        />
      )}
      {galleryPickInitiated && activeUser && (
        <GalleryDialog
          show={galleryPickInitiated}
          setShow={setGalleryPickInitiated}
          onPick={(url) => {
            handleImagePick("", url);
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
