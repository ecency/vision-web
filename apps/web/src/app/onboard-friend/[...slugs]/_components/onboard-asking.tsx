"use client";

import { Button } from "@ui/button";
import { Alert } from "@ui/alert";
import { b64uEnc } from "@/utils";
import i18next from "i18next";
import { copyContent, downloadSvg, regenerateSvg } from "@ui/svg";
import { error, success } from "@/features/shared";
import { clipboard } from "@/utils/clipboard";
import { Tooltip } from "@ui/tooltip";
import { useDownloadKeys } from "@/features/wallet";
import { generateMasterPassword } from "@/utils/master-password";
import { deriveHiveMasterPasswordKeys } from "@ecency/sdk/wallets";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DecodedInfo {
  username: string;
  email: string;
  referral?: string;
}

interface Props {
  decodedInfo: DecodedInfo;
}

export function OnboardAsking({ decodedInfo }: Props) {
  const { activeUser } = useActiveAccount();

  const [masterPassword, setMasterPassword] = useState(() => generateMasterPassword());
  const [fileIsDownloaded, setFileIsDownloaded] = useState(false);
  const [secret, setSecret] = useState("");

  // Reset download flag when master password is regenerated
  useEffect(() => {
    setFileIsDownloaded(false);
  }, [masterPassword]);

  const onboardUrl = typeof window !== "undefined"
    ? `${window.location.origin}/signup/invited/`
    : "";

  const downloadKeys = useDownloadKeys(masterPassword, decodedInfo.username);

  const accountKeys = useMemo(() => {
    if (!masterPassword || !decodedInfo) return null;
    try {
      return deriveHiveMasterPasswordKeys(decodedInfo.username, masterPassword);
    } catch (err: any) {
      error(err?.message);
      return null;
    }
  }, [masterPassword, decodedInfo]);

  useEffect(() => {
    if (!accountKeys || !decodedInfo) return;

    const pubkeys = {
      activePublicKey: accountKeys.activePubkey,
      memoPublicKey: accountKeys.memoPubkey,
      ownerPublicKey: accountKeys.ownerPubkey,
      postingPublicKey: accountKeys.postingPubkey
    };

    const dataToEncode = {
      username: decodedInfo.username,
      email: decodedInfo.email,
      referral: decodedInfo.referral ?? "",
      pubkeys
    };

    setSecret(b64uEnc(JSON.stringify(dataToEncode)));
  }, [accountKeys, decodedInfo]);

  const handleDownload = useCallback(() => {
    downloadKeys();
    setFileIsDownloaded(true);
  }, [downloadKeys]);

  const handleRegenerate = useCallback(() => {
    setMasterPassword(generateMasterPassword());
  }, []);

  const creationLink = onboardUrl + secret;

  return (
    <div className="max-w-[600px] w-full mx-auto">
      <div className="bg-white dark:bg-dark-200 rounded-2xl p-6 md:p-8">
        <h3 className="text-2xl font-semibold text-blue-dark-sky mb-6">
          {i18next.t("onboard.confirm-details")}
        </h3>

        {/* Account details */}
        <div className="space-y-2 mb-6">
          <div>
            <span className="opacity-60">{i18next.t("onboard.username")}</span>{" "}
            <strong>{decodedInfo.username}</strong>
          </div>
          <div>
            <span className="opacity-60">{i18next.t("onboard.email")}</span>{" "}
            <strong>{decodedInfo.email}</strong>
          </div>
          {decodedInfo.referral && (
            <div>
              <span className="opacity-60">{i18next.t("onboard.referral")}</span>{" "}
              <strong>{decodedInfo.referral}</strong>
            </div>
          )}
        </div>

        {/* Master password section */}
        <p className="text-sm opacity-75 mb-3">{i18next.t("onboard.copy-key")}</p>
        <div className="bg-gray-50 dark:bg-dark-default rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono flex-1 break-all">{masterPassword}</span>
            <Tooltip content={i18next.t("onboard.copy-tooltip")}>
              <button
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer"
                onClick={() => {
                  clipboard(masterPassword);
                  success(i18next.t("onboard.copy-password"));
                }}
              >
                {copyContent}
              </button>
            </Tooltip>
            <Tooltip content={i18next.t("onboard.regenerate-password")}>
              <button
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer"
                onClick={handleRegenerate}
              >
                {regenerateSvg}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <Button
            onClick={handleDownload}
            disabled={!decodedInfo.username || !decodedInfo.email}
            icon={downloadSvg}
          >
            {i18next.t("onboard.download-keys")}
          </Button>
        </div>

        {/* Share link after download */}
        {fileIsDownloaded && secret && (
          <Alert className="mt-4">
            <h4 className="font-semibold mb-2">{i18next.t("onboard.copy-info-message")}</h4>
            <div className="flex items-center gap-2">
              <span className="text-sm truncate flex-1 font-mono">{creationLink}</span>
              <button
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer flex-shrink-0"
                onClick={() => {
                  clipboard(creationLink);
                  success(i18next.t("onboard.copy-link"));
                }}
              >
                {copyContent}
              </button>
            </div>
            {activeUser && (
              <a href={creationLink} className="text-sm mt-2 inline-block">
                {i18next.t("onboard.click-link")}
              </a>
            )}
          </Alert>
        )}
      </div>
    </div>
  );
}
