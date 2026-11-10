import { EcencyConfigManager } from "@/config";
import { useGlobalStore } from "@/core/global-store";
import { getAuthUrl } from "@/utils";
import { UilArrowLeft, UilArrowRight } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLoginByKeychain, useLoginByMetaMask } from "./hooks";
import { RecoverAccountLink } from "@/features/account-recovery/recover-account-link";
import { LoginUserByKey } from "./login-user-by-key";
import { LoginUsersList } from "./login-users-list";
import { ExtensionInstallList, useShowExtensionInstall } from "../extension-install-list";
import { ExtensionChooser } from "../extension-chooser";
import { error } from "../feedback";
import { decideExtensionLoginAction } from "./extension-login-action";
import { TabItem } from "@/features/ui";
import clsx from "clsx";
import { shouldUseKeychainMobile } from "@/utils/client";
import { DetectedExtension, HiveExtensionId, getDetectedExtensions, setPreferredExtensionId } from "@/utils/hive-extensions";

export default function Login() {
  const toggleUIProp = useGlobalStore((state) => state.toggleUiProp);

  const [step, setStep] = useState<"start" | "key">("start");
  const [username, setUsername] = useState("");
  const [currentTab, setCurrentTab] = useState("login");
  const [tabs] = useState([
    {
      title: i18next.t("login.my-users"),
      name: "users",
      key: "users"
    },
    {
      title: i18next.t("login.sign-in"),
      name: "login",
      key: "login"
    }
  ]);

  const hsLogin = () =>
    (window.location.href = getAuthUrl(EcencyConfigManager.CONFIG.service.hsClientId));

  const {
    mutateAsync: loginByKeychain,
    isPending: isLoginByKeychainPending
  } = useLoginByKeychain(username);

  const {
    mutateAsync: loginByMetaMask,
    isPending: isLoginByMetaMaskPending
  } = useLoginByMetaMask(username);

  const [detectedExtensions, setDetectedExtensions] = useState<DetectedExtension[]>([]);
  const [useKeychainMobile, setUseKeychainMobile] = useState(false);
  const [showExtensionsInfo, setShowExtensionsInfo] = useState(false);
  const showExtensionInstall = useShowExtensionInstall();

  // Browser extensions inject their globals (window.hive_keychain /
  // window.hive.providers / window.peakvault) asynchronously, often AFTER this
  // component mounts. A single mount-time snapshot therefore misses a genuinely
  // installed extension and wrongly shows the install list. Re-detect on a short
  // poll (mirrors initKeychain's runWithRetries grace) and on window focus so the
  // button self-corrects as the extension comes online.
  useEffect(() => {
    let cancelled = false;
    const detect = () => {
      if (cancelled) return;
      const detected = getDetectedExtensions();
      setDetectedExtensions((prev) =>
        prev.length === detected.length && prev.every((e, i) => e.id === detected[i].id)
          ? prev
          : detected
      );
      setUseKeychainMobile(shouldUseKeychainMobile());
    };
    detect();
    const intervalId = setInterval(detect, 200);
    const stopId = setTimeout(() => clearInterval(intervalId), 2000);
    const onFocus = () => detect();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(stopId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const hasExtensions = detectedExtensions.length > 0 || useKeychainMobile;
  const extensionLabel = useKeychainMobile && detectedExtensions.length === 0
    ? i18next.t("login.keychain-mobile")
    : i18next.t("login.extensions");

  const handleExtensionLogin = () => {
    // Re-read detection at click time: an extension may have injected its globals
    // after the last poll, so we must never act on a stale empty snapshot.
    const detected = getDetectedExtensions();
    setDetectedExtensions(detected);

    const action = decideExtensionLoginAction(detected, username, shouldUseKeychainMobile());
    switch (action.kind) {
      // "install" and "picker" both open the modal; its body renders the install
      // list or the ExtensionChooser based on detectedExtensions.length.
      case "install":
      case "picker":
        setShowExtensionsInfo(true);
        return;
      case "needUsername":
        error(i18next.t("login.write-username"));
        return;
      case "login":
        if (isLoginByKeychainPending) return;
        // Persist the chosen extension (mirrors handleSelectExtension) so later
        // signing/broadcast resolves to the SAME extension the user logged in
        // with. This path fires when exactly one extension is detected and never
        // recorded a preference; if the user later enables a SECOND extension
        // (e.g. Keeper alongside Keychain), the broadcast auto-detect — which is
        // Keeper-first — would otherwise hijack signing and silently drop the
        // request (dead 60s spinner). extId is defined here (length === 1).
        if (action.extId) setPreferredExtensionId(username, action.extId);
        // Sign with the explicit extension so detection and signing can never
        // resolve to different extensions.
        loginByKeychain(action.extId).catch(() => {
          /* Already handled in onError of the mutation */
        });
        return;
    }
  };

  const handleSelectExtension = (extId: HiveExtensionId) => {
    setPreferredExtensionId(username, extId);
    setShowExtensionsInfo(false);
    if (isLoginByKeychainPending) return;
    if (!username) {
      // Don't silently swallow the click: tell the user what's missing.
      error(i18next.t("login.write-username"));
      return;
    }
    loginByKeychain(extId).catch(() => {});
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-4">
      <div className="md:hidden -mx-4 border-b border-[--border-color] grid grid-cols-3 items-center text-center text-sm font-semibold">
        {tabs.map((tab, i) => (
          <TabItem
            isSelected={tab.key === currentTab}
            key={tab.key}
            name={tab.key}
            onSelect={() => setCurrentTab(tab.key)}
            title={tab.title}
            i={i}
          />
        ))}
      </div>

      <LoginUsersList showOnMobile={currentTab === "users"} />

      <div
        className={clsx(
          "flex-col items-start gap-4",
          currentTab === "login" ? "flex" : "hidden md:flex"
        )}
      >
        {step === "key" && (
          <Button
            iconPlacement="left"
            onClick={() => setStep("start")}
            appearance="gray-link"
            size="sm"
            noPadding={true}
            icon={<UilArrowLeft />}
          >
            {i18next.t("g.back")}
          </Button>
        )}

        {step === "start" && (
          <div className="text-xs uppercase font-bold opacity-50 w-full mt-4">
            {i18next.t("login.write-username")}
          </div>
        )}
        <FormControl
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim().toLowerCase())}
          placeholder={i18next.t("login.username-placeholder")}
          autoFocus={true}
          onKeyDown={(e) => {
            if (e.code === "Enter" && !!username) {
              setStep("key");
            }
          }}
        />

        {step === "key" && <LoginUserByKey username={username} />}

        {step === "start" && (
          <div className="grid grid-cols-2 gap-4 w-full animate-fade-in-up">
            <Button
              disabled={!username}
              full={true}
              size="lg"
              icon={<UilArrowRight />}
              className="mt-8 col-span-2"
              onClick={() => !!username && setStep("key")}
            >
              {i18next.t("login.continue-with-key")}
            </Button>

            <Button
              outline={true}
              onClick={hsLogin}
              size="lg"
              full={true}
              appearance="hivesigner"
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
              Hivesigner
            </Button>

            <Button
              appearance="secondary"
              outline={true}
              full={true}
              size="lg"
              onClick={handleExtensionLogin}
              disabled={hasExtensions && (!username || isLoginByKeychainPending)}
              isLoading={isLoginByKeychainPending}
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
                      src="/assets/keeper.svg"
                      alt="extensions"
                      className="size-4"
                    />
                  )}
                </div>
              }
            >
              {extensionLabel}
            </Button>

            {typeof window !== "undefined" && window.ethereum?.isMetaMask && (
              <Button
                appearance="secondary"
                outline={true}
                full={true}
                size="lg"
                className="col-span-2"
                onClick={() => !!username && loginByMetaMask()}
                disabled={!username || isLoginByMetaMaskPending}
                isLoading={isLoginByMetaMaskPending}
                icon={
                  <Image
                    width={100}
                    height={100}
                    src="/assets/metamask-fox.svg"
                    alt="metamask"
                    className="size-4"
                  />
                }
              >
                {i18next.t("key-or-hot.sign-with-metamask", { defaultValue: "Sign with MetaMask" })}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="md:col-span-2 text-sm text-center my-4">
        {i18next.t("login.sign-up-text-1")}
        &nbsp;
        <Link
          href="/signup"
          onClick={() => {
            toggleUIProp("login");
          }}
        >
          {i18next.t("login.sign-up-text-2")}
        </Link>
        <RecoverAccountLink
          className="block mt-2"
          label="recover-account.entry-login"
          onClick={() => toggleUIProp("login")}
        />
      </div>

      <Modal show={showExtensionsInfo} centered={true} onHide={() => setShowExtensionsInfo(false)}>
        <ModalHeader closeButton={true}>
          <ModalTitle>
            {detectedExtensions.length > 1
              ? i18next.t("login.extensions-select-title")
              : i18next.t("login.extensions-info-title")}
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          {detectedExtensions.length > 1 ? (
            <ExtensionChooser extensions={detectedExtensions} onSelect={handleSelectExtension} />
          ) : showExtensionInstall ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {i18next.t("login.extensions-info-description")}
              </p>
              <ExtensionInstallList />
            </>
          ) : (
            // Mobile (or unsupported browser): desktop extensions don't apply,
            // so guide users to the mobile sign-in options instead of links.
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {i18next.t("login.extensions-mobile-note")}
            </p>
          )}
        </ModalBody>
      </Modal>
    </div>
  );
}
