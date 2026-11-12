"use client";

import { useGlobalStore } from "@/core/global-store";
import { StyledTooltip } from "@/features/ui";
import {
  getAccountWalletListQueryOptions,
  getAllTokensListQueryOptions,
} from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ProfileWalletTokensListItem } from "./profile-wallet-tokens-list-item";
import { UilInfoCircle } from "@tooni/iconscout-unicons-react";
import { ProfileWalletTokensListItemLoading } from "./profile-wallet-tokens-list-item-loading";
import { sanitizeWalletUsername } from "@/features/wallet/utils/sanitize-username";

export function ProfileWalletTokensList() {
  const { username } = useParams();
  const currency = useGlobalStore((state) => state.currency);
  const sanitizedUsername = useMemo(
    () => sanitizeWalletUsername(username),
    [username]
  );

  const { data } = useQuery(
    getAccountWalletListQueryOptions(sanitizedUsername, currency || "usd")
  );
  const { data: availableTokens } = useQuery(
    getAllTokensListQueryOptions(sanitizedUsername)
  );

  const visibleTokens = useMemo(() => {
    if (!data) {
      return [];
    }

    if (!availableTokens) {
      return data;
    }

    const supportedTokens = new Set<string>([
      ...(availableTokens.basic ?? []),
      ...(availableTokens.external ?? []),
      ...(availableTokens.layer2 ?? []).map((token) => token.symbol),
    ]);

    return data.filter((token) => supportedTokens.has(token));
  }, [availableTokens, data]);

  const shouldRenderEmptyState = Array.isArray(data) && visibleTokens.length === 0;

  return (
    <div className="bg-white rounded-xl">
      <div className="grid text-sm grid-cols-4 p-3 text-gray-600 dark:text-gray-400 border-b border-[--border-color]">
        <div className="col-span-2 sm:col-span-1">{i18next.t("profile-wallet.asset-name")}</div>
        <div className="hidden sm:block">
          <StyledTooltip size="md" content={i18next.t("profile-wallet.apr-hint")}>
            <div className="flex items-center gap-1">
              {i18next.t("profile-wallet.apr")}
              <UilInfoCircle className="size-4" />
            </div>
          </StyledTooltip>
        </div>
        <div>{i18next.t("profile-wallet.price")}</div>
        <div>{i18next.t("profile-wallet.balance")}</div>
      </div>
      {visibleTokens.map((item: string) => (
        <ProfileWalletTokensListItem
          asset={item}
          key={item}
          username={sanitizedUsername}
        />
      ))}
      {shouldRenderEmptyState &&
        new Array(6).fill(1).map((_, i) => <ProfileWalletTokensListItemLoading key={i} />)}
    </div>
  );
}
