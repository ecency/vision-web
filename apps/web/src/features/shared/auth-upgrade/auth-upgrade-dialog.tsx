"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { Button } from "@ui/button";
import { KeyInput } from "@ui/input";
import i18next from "i18next";
import Image from "next/image";
import { UilArrowLeft } from "@tooni/iconscout-unicons-react";
import { PrivateKey } from "@ecency/sdk";
import { MetaMaskSignButton } from "../metamask-sign-button";
import { ExtensionInstallList, useShowExtensionInstall } from "../extension-install-list";
import { ExtensionChooser } from "../extension-chooser";
import { resolveAuthUpgrade } from "./auth-upgrade-events";
import { shouldUseKeychainMobile } from "@/utils/client";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getLoginType } from "@/utils/user-token";
import {
  extensionSupportsAuthority,
  getDetectedExtensions,
  hasAnyHiveExtension,
  setPreferredExtensionId,
  type HiveExtensionId
} from "@/utils/hive-extensions";
import { isInAppBrowser } from "@/utils/keychain";

interface AuthUpgradeRequest {
  authority: string;
  operation: string;
}

export function AuthUpgradeDialog() {
  const { activeUser } = useActiveAccount();
  const showInstall = useShowExtensionInstall();
  const [request, setRequest] = useState<AuthUpgradeRequest | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AuthUpgradeRequest>).detail;
      setChoosing(false);
      setRequest(detail);
    };
    window.addEventListener("ecency-auth-upgrade", handler);
    return () => window.removeEventListener("ecency-auth-upgrade", handler);
  }, []);

  const handleClose = useCallback(() => {
    setChoosing(false);
    setRequest(null);
    resolveAuthUpgrade(false);
  }, []);

  const handleKeySign = useCallback(
    (privateKey: PrivateKey) => {
      setRequest(null);
      // Convert PrivateKey to WIF string for the adapter's getActiveKey. The
      // username is the one KeyInput derived a master password or seed against,
      // so the key is filed under the account it actually belongs to.
      resolveAuthUpgrade("key", privateKey.toString(), activeUser?.username);
    },
    [activeUser?.username]
  );

  const handleHiveSigner = useCallback(() => {
    setRequest(null);
    resolveAuthUpgrade("hivesigner");
  }, []);

  const handleMetaMask = useCallback(() => {
    setRequest(null);
    // Resolve as 'keychain' — the adapter's broadcastWithKeychain detects
    // metamask login type and routes to the Hive snap automatically
    resolveAuthUpgrade("keychain");
  }, []);

  // User picked a specific extension in the chooser. Persist it so
  // `broadcastWithExtension` targets that extension's own API (e.g. Keychain's
  // `window.hive_keychain`) instead of auto-resolving Keeper-first — which is
  // what triggers Keeper's `extension_id`-not-allowed rejection.
  const handleChooseExtension = useCallback((extId: HiveExtensionId) => {
    setChoosing(false);
    setRequest(null);
    if (activeUser?.username) setPreferredExtensionId(activeUser.username, extId);
    resolveAuthUpgrade("keychain");
  }, [activeUser?.username]);

  if (!request) return null;

  const authority = (request.authority || "active") as "posting" | "active" | "owner";
  const isMetaMaskUser = activeUser && getLoginType(activeUser.username) === "metamask";
  const useKcMobile = shouldUseKeychainMobile(activeUser?.username);
  const detectedExtensions = getDetectedExtensions();
  // The unified "Sign with Extension" button shows when an extension is
  // installed, or there's a Keychain Mobile / in-app deep-link path. On desktop
  // with no extension we show install links instead (below) — never a dead-end.
  // Owner requests (e.g. change_recovery_account) never get it: no extension
  // nor the deep link can sign owner authority.
  const canUseExtensionFallback = useKcMobile || isInAppBrowser();
  const showExtensionBtn =
    extensionSupportsAuthority(authority) &&
    !isMetaMaskUser &&
    (detectedExtensions.length > 0 || hasAnyHiveExtension() || canUseExtensionFallback);
  const extensionLabel = useKcMobile
    ? i18next.t("key-or-hot.with-keychain-mobile", { defaultValue: "Sign with Keychain Mobile" })
    : i18next.t("key-or-hot.with-extension", { defaultValue: "Sign with Extension" });

  // Single unified entry point. With more than one extension installed, defer to
  // the chooser; otherwise resolve straight away (the adapter routes a lone
  // extension, or the Keychain Mobile / in-app deep link, from there).
  const handleExtensionSign = () => {
    if (detectedExtensions.length > 1) {
      setChoosing(true);
      return;
    }
    // Persist the lone extension (like KeyOrHot / WalletOperationSign) so a later
    // broadcast targets it instead of auto-resolving Keeper-first. Without this a
    // Keychain-only user who then installs Keeper would get hijacked on the next
    // active-authority sign.
    if (detectedExtensions.length === 1 && activeUser?.username) {
      setPreferredExtensionId(activeUser.username, detectedExtensions[0].id);
    }
    setRequest(null);
    resolveAuthUpgrade("keychain");
  };

  return (
    <Modal show={true} centered={true} onHide={handleClose}>
      <ModalHeader closeButton={true}>
        <ModalTitle>
          {choosing
            ? i18next.t("login.extensions-select-title")
            : i18next.t("trx-common.sign-title")}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        {choosing ? (
          // The chooser replaces the body (same as login), so offer a Back to
          // the sign options — closing the modal would cancel the whole flow.
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
            <ExtensionChooser extensions={detectedExtensions} onSelect={handleChooseExtension} />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">{i18next.t("trx-common.sign-sub-title")}</p>
            <div className="flex flex-col gap-3">
              {isMetaMaskUser ? (
                <MetaMaskSignButton onClick={handleMetaMask} />
              ) : (
                <>
                  <KeyInput onSign={handleKeySign} keyType={authority} />
                  {authority === "active" && (
                    // Only the active key is kept, only for this tab. Say so
                    // here, where the user decides whether to type it.
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {i18next.t("trx-common.key-kept-for-tab")}
                    </p>
                  )}
                  <div className="flex items-center gap-2 my-1">
                    <hr className="flex-1" />
                    <span className="text-xs text-gray-400">
                      {i18next.t("g.or", { defaultValue: "or" })}
                    </span>
                    <hr className="flex-1" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      outline={true}
                      appearance="hivesigner"
                      onClick={handleHiveSigner}
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
                    {showExtensionBtn && (
                      // Unified entry point — one button regardless of how many
                      // extensions are installed. The choice (when >1) happens in
                      // the chooser, matching the login flow.
                      <Button
                        outline={true}
                        appearance="secondary"
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
                                  alt={ext.name}
                                  className="size-4 rounded-sm"
                                />
                              ))
                            ) : (
                              <Image
                                width={20}
                                height={20}
                                src="/assets/keychain.png"
                                alt="extensions"
                                className="size-4"
                              />
                            )}
                          </div>
                        }
                      >
                        {extensionLabel}
                      </Button>
                    )}
                  </div>
                  {!showExtensionBtn && showInstall && extensionSupportsAuthority(authority) && (
                    // Desktop with no extension and no mobile deep-link path:
                    // instead of a dead-end, point the user at the install
                    // options (browser-appropriate, hidden on mobile). Key entry
                    // / HiveSigner above still work.
                    <div className="mt-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {i18next.t("key-or-hot.no-extension-prompt", {
                          defaultValue: "Don't have a Hive extension? Install one:"
                        })}
                      </p>
                      <ExtensionInstallList />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
