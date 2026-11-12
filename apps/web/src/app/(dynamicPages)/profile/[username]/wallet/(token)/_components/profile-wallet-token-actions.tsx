import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { ExternalTransferDialog, WalletOperationsDialog } from "@/features/wallet";
import { AssetOperation } from "@ecency/sdk";
import {
  EcencyWalletCurrency,
  type TransferableCurrency,
  getTokenOperationsQueryOptions,
} from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import {
  UilArrowRight,
  UilSpinner,
  UilQrcodeScan
} from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import i18next from "i18next";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ModalBody,
  ModalHeader,
  InputGroupCopyClipboard,
  Button
} from "@/features/ui";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import qrcode from "qrcode";
import {
  getProfileWalletOperationLabel,
  profileWalletOperationIcons,
} from "./profile-wallet-token-operation-helpers";
import { getLoginType } from "@/utils/user-token";

export function ProfileWalletTokenActions() {
  const { activeUser } = useActiveAccount();
  const currency = useGlobalStore((state) => state.currency);
  const { token, username } = useParams();
  const pathname = usePathname();

  const tokenSymbol =
    (token as string)?.toUpperCase() ?? pathname.split("/")[3]?.toUpperCase();
  const cleanUsername = typeof username === "string" ? username.replace(/%40/g, "") : "";

  const { data: operations } = useQuery({
    ...getTokenOperationsQueryOptions(
      tokenSymbol,
      cleanUsername,
      activeUser?.username === cleanUsername,
      currency || "usd"
    ),
    enabled: !!tokenSymbol && !!cleanUsername,
  });

  const isExternalToken = useMemo(
    () =>
      (Object.values(EcencyWalletCurrency) as string[]).includes(
        tokenSymbol ?? ""
      ),
    [tokenSymbol]
  );

  const filteredOperations = useMemo(
    () =>
      (operations ?? []).filter(
        (operation) =>
          !(pathname.includes("points") && operation === AssetOperation.Claim)
      ),
    [operations, pathname]
  );

  const { data: account } = useQuery({
    ...getAccountFullQueryOptions(cleanUsername),
    enabled: isExternalToken && Boolean(cleanUsername)
  });

  const matchedToken = useMemo(() => {
    if (!isExternalToken) return undefined;
    const tokens = account?.profile?.tokens;
    if (!Array.isArray(tokens)) return undefined;
    return tokens.find((item) => {
      const symbol = typeof item.symbol === "string" ? item.symbol.toUpperCase() : undefined;
      return symbol === tokenSymbol;
    });
  }, [account?.profile?.tokens, isExternalToken, tokenSymbol]);

  const externalWalletAddress = useMemo(() => {
    if (!matchedToken) return undefined;

    const metaAddress =
      typeof matchedToken.meta === "object" && matchedToken.meta
        ? (matchedToken.meta as Record<string, unknown>).address
        : undefined;

    if (typeof metaAddress === "string" && metaAddress.trim().length > 0) {
      return metaAddress.trim();
    }

    const directAddress = (matchedToken as { address?: unknown }).address;
    if (typeof directAddress === "string" && directAddress.trim().length > 0) {
      return directAddress.trim();
    }

    return undefined;
  }, [matchedToken]);

  const isWatchOnly = (matchedToken as any)?.watchOnly === true;
  const isOwnWallet = activeUser?.username === cleanUsername;
  const isMetaMaskUser = activeUser && getLoginType(activeUser.username) === "metamask";
  const TRANSFERABLE_TOKENS = [EcencyWalletCurrency.ETH, EcencyWalletCurrency.BNB, EcencyWalletCurrency.SOL];
  const canTransfer = isOwnWallet && isMetaMaskUser && !isWatchOnly && isExternalToken &&
    TRANSFERABLE_TOKENS.includes(tokenSymbol as EcencyWalletCurrency);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [qrCodeSrc, setQrCodeSrc] = useState<string>();
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!showReceiveModal) {
      setQrCodeSrc(undefined);
      setQrError(false);
      setIsQrLoading(false);
      return;
    }

    if (!externalWalletAddress) {
      setQrCodeSrc(undefined);
      setQrError(false);
      setIsQrLoading(false);
      return;
    }

    let cancelled = false;

    setIsQrLoading(true);
    setQrError(false);

    qrcode
      .toDataURL(externalWalletAddress, { width: 280 })
      .then((src) => {
        if (!cancelled) {
          setQrCodeSrc(src);
          setIsQrLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError(true);
          setIsQrLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [externalWalletAddress, showReceiveModal]);

  const actionCardClass =
    " bg-white/80 dark:bg-dark-200/90 glass-box rounded-xl p-3 flex flex-col sm:flex-row items-center text-center text-sm gap-2 border border-white dark:border-dark-200 duration-300 min-h-[66px]";
  const interactiveActionCardClass =
    " cursor-pointer hover:border-blue-dark-sky dark:hover:border-blue-dark-sky hover:text-blue-dark-sky";

  const totalActionsCount = filteredOperations.length + (isExternalToken ? 2 : 0);

  if (totalActionsCount === 0) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:gap-2 grid-rows-2">
        {isExternalToken && (
          <>
            <button
              type="button"
              className={clsx(
                actionCardClass,
                interactiveActionCardClass,
                "text-left"
              )}
              onClick={() => setShowReceiveModal(true)}
            >
              <UilQrcodeScan className="size-6" />
              <div className="w-full font-bold">
                {i18next.t("profile-wallet.external.receive-button")}
              </div>
            </button>
            <button
              type="button"
              disabled={!canTransfer}
              className={clsx(
                actionCardClass,
                canTransfer
                  ? [interactiveActionCardClass, "text-left"]
                  : "opacity-60 cursor-not-allowed text-left"
              )}
              onClick={canTransfer ? () => setShowTransferModal(true) : undefined}
            >
              <UilArrowRight className="size-6" />
              <div className="w-full font-bold">
                {canTransfer
                  ? i18next.t("profile-wallet.external.transfer-button", { defaultValue: "Send" })
                  : i18next.t("profile-wallet.external.transfer-soon")}
              </div>
            </button>
          </>
        )}
        {filteredOperations.map((operation, index) => {
          const key = `operation-${operation}-${index}`;

          const operationLabel = getProfileWalletOperationLabel(operation);

          if ([AssetOperation.Buy, AssetOperation.Promote].includes(operation)) {
            return (
              <Link
                key={key}
                href={
                  [AssetOperation.Buy, AssetOperation.Claim].includes(operation)
                    ? "/perks/points"
                    : "/perks/promote-post"
                }
                className={clsx(
                  actionCardClass,
                  interactiveActionCardClass,
                  AssetOperation.Buy === operation && "text-blue-dark-sky border-blue-dark-sky"
                )}
              >
                {profileWalletOperationIcons[operation]}
                <div className="w-full font-bold">
                  {operationLabel}
                </div>
              </Link>
            );
          }

          if (![AssetOperation.Buy, AssetOperation.Promote, AssetOperation.Claim].includes(operation)) {
            return (
              <WalletOperationsDialog
                key={key}
                className={clsx(actionCardClass, interactiveActionCardClass)}
                asset={tokenSymbol}
                operation={operation}
                to={
                  cleanUsername && cleanUsername !== activeUser?.username ? cleanUsername : undefined
                }
              >
                {profileWalletOperationIcons[operation]}
                <div className="w-full font-bold">
                  {operationLabel}
                </div>
              </WalletOperationsDialog>
            );
          }

          return null;
        })}
        {Array.from({ length: Math.max(0, 4 - totalActionsCount) }).map((_, i) => (
          <div
            className="bg-white/40 dark:bg-dark-200/40 rounded-xl p-3 flex flex-col gap-4 min-h-[66px]"
            key={`placeholder-${i}`}
          />
        ))}
      </div>

      <Modal
        centered={true}
        show={showReceiveModal}
        onHide={() => setShowReceiveModal(false)}
      >
        <ModalHeader closeButton={true}>
          <div className="font-semibold">
            {i18next.t("profile-wallet.external.receive-title", { token: tokenSymbol })}
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            {externalWalletAddress ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {i18next.t("profile-wallet.external.receive-description", {
                    token: tokenSymbol
                  })}
                </p>
                <div className="flex flex-col items-center gap-3">
                  {qrError && (
                    <div className="text-sm text-red-500">
                      {i18next.t("profile-wallet.external.receive-qr-error")}
                    </div>
                  )}
                  {!qrError && isQrLoading && (
                    <div className="flex flex-col items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <UilSpinner className="size-6 animate-spin text-blue-dark-sky" />
                      {i18next.t("profile-wallet.external.receive-loading")}
                    </div>
                  )}
                  {!qrError && !isQrLoading && qrCodeSrc && (
                    <img
                      src={qrCodeSrc}
                      alt={i18next.t("profile-wallet.external.receive-qr-alt", {
                        token: tokenSymbol
                      })}
                      className="size-48 max-w-full rounded-xl border border-[--border-color] bg-white p-3"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {i18next.t("profile-wallet.external.address-label", { token: tokenSymbol })}
                  </div>
                  <InputGroupCopyClipboard value={externalWalletAddress} />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {i18next.t("profile-wallet.external.receive-no-address")}
              </p>
            )}
            <div className="flex justify-end">
              <Button appearance="secondary" onClick={() => setShowReceiveModal(false)}>
                {i18next.t("g.close")}
              </Button>
            </div>
          </div>
        </ModalBody>
      </Modal>

      {canTransfer && (
        <ExternalTransferDialog
          currency={tokenSymbol as TransferableCurrency}
          username={cleanUsername}
          show={showTransferModal}
          onHide={() => setShowTransferModal(false)}
        />
      )}
    </>
  );
}
