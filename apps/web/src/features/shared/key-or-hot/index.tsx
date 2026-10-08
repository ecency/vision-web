"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useIsMobile } from "@/utils";
import { PrivateKey } from "@ecency/sdk";
import { Button } from "@ui/button";
import { KeyInput } from "@ui/input";
import { UilArrowLeft } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { useCallback, useState } from "react";
import { OrDivider } from "../or-divider";
import { MetaMaskSignButton } from "../metamask-sign-button";
import { ExtensionChooser } from "../extension-chooser";
import { shouldUseKeychainMobile } from "@/utils/client";
import { isInAppBrowser } from "@/utils/keychain";
import { getLoginType } from "@/utils/user-token";
import {
  extensionSupportsAuthority,
  getDetectedExtensions,
  setPreferredExtensionId,
  type HiveExtensionId
} from "@/utils/hive-extensions";

interface Props {
  inProgress: boolean;
  onKey: (key: PrivateKey) => void;
  onHot?: () => void;
  onKc?: () => void;
  onMetaMask?: () => void;
  keyOnly?: boolean;
  authority?: "owner" | "active";
}

export function KeyOrHot({ inProgress, onKey, onHot, onKc, onMetaMask, keyOnly, authority="active" }: Props) {
  const { activeUser } = useActiveAccount();
  const isMobileBrowser = useIsMobile();
  const useKcMobile = shouldUseKeychainMobile(activeUser?.username);
  const isMetaMaskUser = activeUser && getLoginType(activeUser.username) === "metamask";
  // No extension (Keychain, Keeper, Peak Vault) nor the Keychain Mobile deep
  // link can sign owner-authority operations, so owner flows (key rotation,
  // owner-key revoke) get the key input only, plus a hint saying why.
  const extensionsAllowed = extensionSupportsAuthority(authority);
  const canRenderKeychain =
    extensionsAllowed &&
    !isMetaMaskUser &&
    onKc &&
    (!isMobileBrowser || useKcMobile || isInAppBrowser());
  const showOwnerHint = !extensionsAllowed && !isMetaMaskUser && !keyOnly && onKc;
  const username = activeUser?.username;
  const [choosing, setChoosing] = useState(false);
  const detectedExtensions = getDetectedExtensions();
  const extensionLabel = useKcMobile
    ? i18next.t("key-or-hot.with-keychain-mobile", { defaultValue: "Sign with Keychain Mobile" })
    : i18next.t("key-or-hot.with-extension", { defaultValue: "Sign with Extension" });

  // Unified extension entry. Re-read detection at click time (globals inject
  // asynchronously). With more than one extension, defer to the chooser;
  // otherwise persist the lone extension (per username) and sign. The persisted
  // choice makes the downstream broadcast target it instead of Keeper-first.
  const handleExtensionSign = useCallback(() => {
    const detected = getDetectedExtensions();
    if (detected.length > 1) {
      setChoosing(true);
      return;
    }
    if (detected.length === 1 && username) {
      setPreferredExtensionId(username, detected[0].id);
    }
    onKc?.();
  }, [username, onKc]);

  const handleChooseExtension = useCallback(
    (extId: HiveExtensionId) => {
      setChoosing(false);
      if (username) setPreferredExtensionId(username, extId);
      onKc?.();
    },
    [username, onKc]
  );

  if (isMetaMaskUser && onMetaMask && !keyOnly) {
    return (
      <div className="key-or-hot">
        <MetaMaskSignButton onClick={() => onMetaMask()} />
      </div>
    );
  }

  return (
    <>
      <div className="key-or-hot">
        <KeyInput onSign={onKey} keyType={authority}/>
        {showOwnerHint && (
          <div className="text-xs opacity-75 mt-2">
            {i18next.t("key-or-hot.owner-key-only", {
              defaultValue:
                "Browser extensions cannot sign owner-level changes. Enter your owner private key or master password instead."
            })}
          </div>
        )}
        {!keyOnly && (onHot || canRenderKeychain) && (
          <>
            <OrDivider />
            {choosing ? (
              <div className="flex flex-col gap-3">
                <Button
                  iconPlacement="left"
                  appearance="gray-link"
                  size="sm"
                  noPadding={true}
                  onClick={() => setChoosing(false)}
                  icon={<UilArrowLeft />}
                >
                  {i18next.t("g.back")}
                </Button>
                <ExtensionChooser
                  extensions={detectedExtensions}
                  onSelect={handleChooseExtension}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {onHot && (
                  <Button
                    size="lg"
                    outline={true}
                    appearance="hivesigner"
                    onClick={() => onHot()}
                    icon={
                      <Image
                        width={100}
                        height={100}
                        src="/assets/hive-signer.svg"
                        className="size-4"
                        alt="hivesigner"
                      />
                    }
                  >
                    {i18next.t("key-or-hot.with-hivesigner")}
                  </Button>
                )}

                {canRenderKeychain && (
                  <Button
                    outline={true}
                    appearance="secondary"
                    size="lg"
                    onClick={handleExtensionSign}
                    icon={
                      <div className="flex items-center -space-x-1">
                        {detectedExtensions.length > 0 ? (
                          detectedExtensions.map((ext) => (
                            <Image
                              key={ext.id}
                              width={20}
                              height={20}
                              src={ext.icon}
                              className="size-4 rounded-sm"
                              alt={ext.name}
                            />
                          ))
                        ) : (
                          <Image
                            width={100}
                            height={100}
                            src="/assets/keychain.png"
                            className="size-4"
                            alt="extensions"
                          />
                        )}
                      </div>
                    }
                  >
                    {extensionLabel}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
