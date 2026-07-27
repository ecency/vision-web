"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken, getLoginType } from "@/utils/user-token";
import { Button } from "@/features/ui";
import {
  checkUsernameWalletsPendingQueryOptions,
  getAccountFullQueryOptions,
} from "@ecency/sdk";
import { EcencyWalletCurrency } from "@ecency/wallets";
import { useQuery } from "@tanstack/react-query";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useLocalStorage from "react-use/lib/useLocalStorage";

const EXTERNAL_BANNER_STORAGE_KEY_PREFIX = "externalWalletSetupBannerDismissed";
const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;

export function ProfileWalletExternalBanner() {
  const { username } = useParams();
  const usernameParam = typeof username === "string" ? username : "";
  const cleanUsername = usernameParam.replace(/%40/g, "");
  const storageKey = `${EXTERNAL_BANNER_STORAGE_KEY_PREFIX}:${cleanUsername || "unknown"}`;

  const [dismissedAt, setDismissedAt, removeDismissedAt] = useLocalStorage<number | null>(
    storageKey,
    null
  );

  // Avoid hydration mismatch: SSR has no localStorage so `dismissedAt` is the
  // default (null) and the banner renders; but a returning user may have
  // dismissed it, which would make the first client render skip the banner
  // entirely — a different DOM tree than SSR, triggering React error #418.
  // Treat as "not dismissed" until after mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const isDismissed = useMemo(() => {
    if (!hydrated || !dismissedAt) {
      return false;
    }

    const diff = Date.now() - dismissedAt;
    return diff < THIRTY_DAYS_IN_MS;
  }, [hydrated, dismissedAt]);

  useEffect(() => {
    if (!dismissedAt) {
      return;
    }

    const diff = Date.now() - dismissedAt;
    if (diff >= THIRTY_DAYS_IN_MS) {
      removeDismissedAt();
    }
  }, [dismissedAt, removeDismissedAt]);

  const { activeUser } = useActiveAccount();
  const isOwnProfile = activeUser?.username === cleanUsername;
  const accessToken = isOwnProfile ? getAccessToken(cleanUsername) : undefined;
  const isMetaMaskUser = isOwnProfile && getLoginType(cleanUsername) === "metamask";

  const { data } = useQuery({
    ...getAccountFullQueryOptions(cleanUsername),
    enabled: isOwnProfile && Boolean(cleanUsername)
  });

  const { data: walletCheckData } = useQuery({
    ...checkUsernameWalletsPendingQueryOptions(cleanUsername, accessToken),
    enabled: isOwnProfile && Boolean(cleanUsername) && Boolean(accessToken)
  });

  // Check if profile already has chain tokens in posting_json_metadata
  const hasOnChainTokens = useMemo(
    () =>
      Array.isArray(data?.profile?.tokens) &&
      data.profile.tokens.some(({ symbol }) =>
        Object.values(EcencyWalletCurrency).includes(symbol as any)
      ),
    [data]
  );

  if (!isOwnProfile || isDismissed) {
    return <></>;
  }

  // If tokens are already in posting_json_metadata, nothing to do
  if (hasOnChainTokens) {
    return <></>;
  }

  // For MetaMask users: always show banner if posting_json_metadata doesn't have tokens yet,
  // even if backend knows about wallets (from signup). They need to link to save on-chain.
  // For non-MetaMask users: show if backend also doesn't have wallets.
  if (!isMetaMaskUser && walletCheckData?.exist) {
    return <></>;
  }

  return (
    <div className="bg-white dark:bg-dark-200 rounded-xl p-3 mb-4 flex flex-col md:flex-row items-center gap-4 lg:gap-6">
      {/* This banner sits at the top of the wallet page and is that page's LCP
          element in the field. It only mounts once the profile/wallet queries
          resolve, so the default lazy loading adds an intersection-observer
          pass on top of that wait (CF RUM: 4.0s p75 resource-load-delay).
          Fetch it as soon as it mounts instead. */}
      <Image src="/assets/undraw-digital-currency.svg" alt="" width={300} height={300} priority />
      <div className="flex flex-col items-start gap-2 lg:gap-4 flex-1">
        <h3 className="text-2xl">
          {isMetaMaskUser
            ? i18next.t("wallet.link-metamask.banner-title", {
                defaultValue: "Link your MetaMask wallets"
              })
            : i18next.t("profile-wallet.external-wallets-offer.title")}
        </h3>
        <div className="opacity-75">
          {isMetaMaskUser
            ? i18next.t("wallet.link-metamask.banner-description", {
                defaultValue:
                  "Save your ETH, BNB, and SOL addresses to your Hive profile to view balances and enable transactions."
              })
            : i18next.t("profile-wallet.external-wallets-offer.description")}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button href="/wallet/setup-external" size="lg" icon={<UilArrowRight />}>
            {isMetaMaskUser
              ? i18next.t("wallet.link-metamask.title", { defaultValue: "Link MetaMask" })
              : i18next.t("intro.c2a")}
          </Button>
          <Button
            appearance="secondary"
            outline
            size="lg"
            onClick={() => setDismissedAt(Date.now())}
          >
            {i18next.t("profile-wallet.external-wallets-offer.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
