"use client";

import { Button } from "@ui/button";
import { Alert } from "@ui/alert";
import { FormControl } from "@ui/input";
import { b64uEnc } from "@/utils";
import { getUsernameError, handleInvalid, handleOnInput } from "@/utils";
import i18next from "i18next";
import { copyContent, downloadSvg, regenerateSvg } from "@ui/svg";
import { error, success } from "@/features/shared/feedback";
import { clipboard } from "@/utils/clipboard";
import { Tooltip } from "@ui/tooltip";
import { useDownloadKeys } from "@/features/wallet";
import { generateMasterPassword } from "@/utils/master-password";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAccountsQueryOptions } from "@ecency/sdk";
import { deriveHiveMasterPasswordKeys } from "@ecency/sdk/wallets";
import { useQueryClient } from "@tanstack/react-query";
import useDebounce from "react-use/lib/useDebounce";

export default function InvitedSignupPage() {
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [fileIsDownloaded, setFileIsDownloaded] = useState(false);
  const [masterPassword, setMasterPassword] = useState(() => generateMasterPassword());

  // Validate username format
  useEffect(() => {
    if (!username && !usernameTouched) return;
    const err = getUsernameError(username);
    setUsernameError(err || "");
  }, [username, usernameTouched]);

  // Check if username already exists (debounced)
  useDebounce(
    () => {
      if (getUsernameError(username)) return;
      if (username.length >= 3 && username.length <= 16) {
        queryClient.fetchQuery(getAccountsQueryOptions([username])).then((r) => {
          if (r.length > 0) {
            setUsernameError(i18next.t("sign-up.username-exists"));
          }
        });
      }
    },
    1000,
    [username]
  );

  // Validate email
  useEffect(() => {
    if (!email) {
      setEmailError("");
    } else if (email.length > 72) {
      setEmailError(i18next.t("sign-up.email-max-length-error"));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(i18next.t("sign-up.email-format-error", { defaultValue: "Invalid email format" }));
    } else {
      setEmailError("");
    }
  }, [email]);

  // Keys derived from username + master password (both synchronous, no debounce needed)
  const downloadKeys = useDownloadKeys(masterPassword, username);

  const accountKeys = useMemo(() => {
    if (!masterPassword || !username) return null;
    try {
      return deriveHiveMasterPasswordKeys(username, masterPassword);
    } catch (err: any) {
      error(err?.message);
      return null;
    }
  }, [masterPassword, username]);

  // Build the shareable link with pubkeys
  const shareLink = useMemo(() => {
    if (!accountKeys || !username || !email) return "";
    const data = {
      username,
      email,
      pubkeys: {
        ownerPublicKey: accountKeys.ownerPubkey,
        activePublicKey: accountKeys.activePubkey,
        postingPublicKey: accountKeys.postingPubkey,
        memoPublicKey: accountKeys.memoPubkey
      }
    };
    const hash = b64uEnc(JSON.stringify(data));
    return typeof window !== "undefined"
      ? `${window.location.origin}/signup/invited/${hash}`
      : "";
  }, [accountKeys, username, email]);

  const canProceed = !usernameError && !emailError && username && email;

  const handleContinue = useCallback(async () => {
    if (!canProceed) return;

    // Final check: username exists?
    const existing = await queryClient.fetchQuery(getAccountsQueryOptions([username]));
    if (existing.length > 0) {
      setUsernameError(i18next.t("sign-up.username-exists"));
      return;
    }
    setShowKeys(true);
  }, [canProceed, username, queryClient]);

  const handleDownload = useCallback(() => {
    downloadKeys();
    setFileIsDownloaded(true);
  }, [downloadKeys]);

  const handleRegenerate = useCallback(() => {
    setMasterPassword(generateMasterPassword());
    setFileIsDownloaded(false);
  }, []);

  return (
    <div className="max-w-[540px] mx-auto">
      <div className="reading-surface rounded-2xl p-6 md:p-8">
        <h2 className="text-2xl font-bold mb-2">
          {i18next.t("onboard.title-visitor", { defaultValue: "Get invited by a friend" })}
        </h2>
        <p className="opacity-60 mb-6">
          {i18next.t("onboard.invited-description", {
            defaultValue: "Choose your username and email, then share the link with a friend who has a Hive account. They will create your account for you."
          })}
        </p>

        {!showKeys ? (
          <>
            <div className="mb-4">
              <FormControl
                type="text"
                placeholder={i18next.t("sign-up.username")}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoFocus={true}
                required={true}
                onInvalid={(e: any) => handleInvalid(e, "sign-up.", "validation-username")}
                aria-invalid={usernameError !== ""}
                onInput={handleOnInput}
                onBlur={() => setUsernameTouched(true)}
              />
              {usernameError && (
                <small className="text-red pl-3">{usernameError}</small>
              )}
            </div>
            <div className="mb-6">
              <FormControl
                type="email"
                placeholder={i18next.t("sign-up.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={true}
                onInvalid={(e: any) => handleInvalid(e, "sign-up.", "validation-email")}
                aria-invalid={emailError !== ""}
                onInput={handleOnInput}
              />
              {emailError && (
                <small className="text-red pl-3">{emailError}</small>
              )}
              <p className="text-xs opacity-50 mt-1 pl-3">
                {i18next.t("onboard.email-hint", {
                  defaultValue: "We'll notify you when your friend creates the account."
                })}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleContinue}
              disabled={!canProceed}
            >
              {i18next.t("g.continue")}
            </Button>
          </>
        ) : (
          <>
            {/* Master password */}
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

            <div className="flex justify-center mb-6">
              <Button onClick={handleDownload} icon={downloadSvg}>
                {i18next.t("onboard.download-keys")}
              </Button>
            </div>

            {/* Share link */}
            {fileIsDownloaded && shareLink && (
              <Alert className="mt-2">
                <h4 className="font-semibold mb-2">
                  {i18next.t("onboard.share-link-title", {
                    defaultValue: "Share this link with your friend"
                  })}
                </h4>
                <p className="text-xs opacity-60 mb-2">
                  {i18next.t("onboard.share-link-desc", {
                    defaultValue: "Your friend needs a Hive account to create yours. Send them this link."
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate flex-1 font-mono">{shareLink}</span>
                  <button
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer flex-shrink-0"
                    onClick={() => {
                      clipboard(shareLink);
                      success(i18next.t("onboard.copy-link"));
                    }}
                  >
                    {copyContent}
                  </button>
                </div>
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );
}
