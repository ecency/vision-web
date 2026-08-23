import React, { useCallback, useRef, useState } from "react";
import { Spinner } from "@ui/spinner";
import { Button, ButtonProps } from "@ui/button";
import { uploadSvg } from "@ui/svg";
import { error, success } from "@/features/shared";
import i18next from "i18next";
import { ensureValidToken } from "@/utils";
import { uploadImage } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface UploadButtonProps {
  onBegin: () => void;
  onEnd: (url: string) => void;
  size?: ButtonProps["size"];
  appearance?: ButtonProps["appearance"];
  className?: string;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
}

export function ImageUploadButton({ onBegin, onEnd, size = "sm", appearance, className, disabled, ...restProps }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeUser } = useActiveAccount();
  const [inProgress, setInProgress] = useState(false);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files || files.length === 0) {
        return;
      }

      const file = files[0];

      if (!activeUser) {
        error(i18next.t("g.login"));
        return;
      }

      onBegin();
      setInProgress(true);

      try {
        const token = await ensureValidToken(activeUser.username);

        if (!token) {
          error(i18next.t("editor-toolbar.image-error-cache"));
          return;
        }

        const r = await uploadImage(file, token);
        onEnd(r.url);
        success(i18next.t("image-upload-button.uploaded"));
      } catch (e) {
        error(i18next.t("g.server-error"), undefined, { error: e });
      } finally {
        setInProgress(false);
      }
    },
    [activeUser, onBegin, onEnd]
  );

  return (
    <>
      <Button
        size={size}
        appearance={appearance}
        disabled={inProgress || disabled}
        onClick={() => inputRef.current?.click()}
        icon={inProgress ? <Spinner className="size-3.5" /> : uploadSvg}
        className={className}
        aria-label={restProps["aria-label"]}
        title={restProps.title}
      />
      <input
        type="file"
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileInput}
      />
    </>
  );
}
