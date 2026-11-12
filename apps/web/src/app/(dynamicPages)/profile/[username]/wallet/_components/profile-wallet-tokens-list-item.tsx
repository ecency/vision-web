"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { FormattedCurrency } from "@/features/shared";
import { Badge } from "@/features/ui";
import { getTokenLogo, WalletOperationsDialog } from "@/features/wallet";
import { getLayer2TokenIcon } from "@/features/wallet/utils/get-layer2-token-icon";
import { sanitizeWalletUsername } from "@/features/wallet/utils/sanitize-username";
import { formatApr } from "@/utils";
import { formatAssetBalance } from "@/features/wallet/utils/format-asset-balance";
import { proxifyImageSrc } from "@ecency/render-helper";
import { AssetOperation, getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk";
import {
  getAllTokensListQueryOptions,
  getTokenOperationsQueryOptions,
} from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import i18next from "i18next";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { UilEllipsisH } from "@tooni/iconscout-unicons-react";
import { ProfileWalletTokensListItemLoading } from "./profile-wallet-tokens-list-item-loading";
import {
  ProfileWalletClaimPointsButton,
  useProfileWalletPointsClaimState,
} from "../(token)/_components/profile-wallet-claim-points-button";
import {
  ProfileWalletHpClaimRewardsButton,
  useProfileWalletHpClaimState,
} from "../(token)/_components/profile-wallet-hp-claim-rewards-button";
import {
  ProfileWalletHbdClaimRewardsButton,
  useProfileWalletHbdClaimState,
} from "../(token)/_components/profile-wallet-hbd-claim-rewards-button";
import {
  ProfileWalletHiveClaimRewardsButton,
  useProfileWalletHiveClaimState,
} from "../(token)/_components/profile-wallet-hive-claim-rewards-button";
import {
  HiveEngineClaimRewardsButton,
  useHiveEngineClaimRewardsState,
} from "../(token)/[token]/_components/hive-engine-claim-rewards-button";
import {
  getProfileWalletOperationLabel,
  profileWalletOperationIcons,
} from "../(token)/_components/profile-wallet-token-operation-helpers";

interface Props {
  username: string;
  asset: string;
}

export function ProfileWalletTokensListItem({ asset, username }: Props) {
  const { activeUser } = useActiveAccount();
  const currency = useGlobalStore((state) => state.currency);
  const sanitizedUsername = useMemo(
    () => sanitizeWalletUsername(username),
    [username]
  );

  const assetSymbol = useMemo(() => asset.toUpperCase(), [asset]);

  const { data } = useQuery(
    getAccountWalletAssetInfoQueryOptions(sanitizedUsername, asset, { refetch: false, currency: currency || "usd" })
  );
  const { data: allTokens } = useQuery(
    getAllTokensListQueryOptions(sanitizedUsername)
  );
  const { data: tokenOperations } = useQuery(
    getTokenOperationsQueryOptions(
      assetSymbol,
      sanitizedUsername,
      activeUser?.username === sanitizedUsername,
      currency || "usd"
    )
  );
  const layer2Token = useMemo(
    () => allTokens?.layer2?.find((token) => token.symbol === assetSymbol),
    [allTokens?.layer2, assetSymbol]
  );

  const logo = useMemo(() => {
    if (layer2Token) {
      const icon = getLayer2TokenIcon(layer2Token.metadata);

      if (icon) {
        return (
          <Image
            alt=""
            src={proxifyImageSrc(icon, 32, 32, "match")}
            width={32}
            height={32}
            className="rounded-lg p-1 object-cover min-w-[32px] max-w-[32px] h-[32px] border border-[--border-color]"
          />
        );
      }

      return (
        <div className="rounded-lg min-w-[32px] max-w-[32px] h-[32px] border border-[--border-color] flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-[10px] font-semibold uppercase text-gray-600 dark:text-gray-200">
          {layer2Token.symbol.slice(0, 3)}
        </div>
      );
    }
    const tokenName = data?.name ?? assetSymbol;
    return getTokenLogo(tokenName);
  }, [assetSymbol, data?.name, layer2Token]);

  const formattedAccountBalance = formatAssetBalance(Number(data?.accountBalance ?? 0));

  const filteredOperations = useMemo(
    () =>
      (tokenOperations ?? []).filter(
        (operation) =>
          !(assetSymbol === "POINTS" && operation === AssetOperation.Claim)
      ),
    [assetSymbol, tokenOperations]
  );

  const [activeOperation, setActiveOperation] = useState<AssetOperation | null>(null);

  const dropdownOperationItems = useMemo(
    () =>
      filteredOperations.map((operation, index) => {
        const key = `${assetSymbol}-${operation}-${index}`;
        const operationLabel = getProfileWalletOperationLabel(operation);
        const icon = profileWalletOperationIcons[operation];

        if (
          [AssetOperation.Buy, AssetOperation.Promote, AssetOperation.Claim].includes(
            operation
          )
        ) {
          const href = [AssetOperation.Buy, AssetOperation.Claim].includes(operation)
            ? "/perks/points"
            : "/perks/promote-post";

          return (
            <DropdownItemWithIcon
              key={key}
              icon={icon}
              label={operationLabel}
              href={href}
            />
          );
        }

        return (
          <DropdownItemWithIcon
            key={key}
            icon={icon}
            label={operationLabel}
            onClick={() => setActiveOperation(operation)}
          />
        );
      }),
    [assetSymbol, filteredOperations]
  );

  const hasDropdownOperations = dropdownOperationItems.length > 0;

  const actionDropdown = hasDropdownOperations ? (
    <Dropdown
      className="relative"
      onClick={(event) => event.stopPropagation()}
      data-wallet-token-actions
    >
      <DropdownToggle>
        <button
          type="button"
          className="p-1 rounded-lg text-gray-500 hover:text-blue-dark-sky hover:bg-blue-dark-sky-040 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-dark-sky"
          title={i18next.t("g.actions")}
          aria-label={i18next.t("g.actions")}
        >
          <UilEllipsisH className="size-4" />
        </button>
      </DropdownToggle>
      <DropdownMenu align="right" size="small">
        {dropdownOperationItems}
      </DropdownMenu>
    </Dropdown>
  ) : null;

  const activeOperationDialog = activeOperation !== null ? (
    <WalletOperationsDialog
      key={`${assetSymbol}-${activeOperation}`}
      controlled={{ show: true, onHide: () => setActiveOperation(null) }}
      asset={assetSymbol}
      operation={activeOperation}
      to={
        sanitizedUsername && sanitizedUsername !== activeUser?.username
          ? sanitizedUsername
          : undefined
      }
    />
  ) : null;

  const { hasPendingPoints } = useProfileWalletPointsClaimState(
    sanitizedUsername,
    assetSymbol === "POINTS"
  );
  const { hasRewards: hasHpRewards } = useProfileWalletHpClaimState(
    sanitizedUsername,
    assetSymbol === "HP"
  );
  const { hasRewards: hasHbdRewards } = useProfileWalletHbdClaimState(
    sanitizedUsername,
    assetSymbol === "HBD"
  );
  const { hasRewards: hasHiveRewards } = useProfileWalletHiveClaimState(
    sanitizedUsername,
    assetSymbol === "HIVE"
  );
  const { hasPendingRewards: hasHiveEngineRewards } =
    useHiveEngineClaimRewardsState(
      sanitizedUsername,
      assetSymbol,
      Boolean(layer2Token),
      data?.pendingRewards
    );

  const handleLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const targetElement = event.target as HTMLElement | null;

    if (targetElement?.closest("[data-wallet-token-actions]")) {
      event.preventDefault();
    }
  }, []);

  if (!data) {
    return <ProfileWalletTokensListItemLoading />;
  }

  const targetHref = `/@${sanitizedUsername}/wallet/${asset.toLowerCase()}`;

  const formattedApr = formatApr(data?.apr);

  let claimButton: ReactNode = null;

  if (assetSymbol === "POINTS" && hasPendingPoints) {
    claimButton = (
      <ProfileWalletClaimPointsButton
        username={sanitizedUsername}
        className="w-full sm:w-auto"
        showIcon
      />
    );
  } else if (assetSymbol === "HP" && hasHpRewards) {
    claimButton = (
      <ProfileWalletHpClaimRewardsButton
        username={sanitizedUsername}
        className="w-full sm:w-auto"
        showIcon
      />
    );
  } else if (assetSymbol === "HBD" && hasHbdRewards) {
    claimButton = (
      <ProfileWalletHbdClaimRewardsButton
        username={sanitizedUsername}
        className="w-full sm:w-auto"
        showIcon
      />
    );
  } else if (assetSymbol === "HIVE" && hasHiveRewards) {
    claimButton = (
      <ProfileWalletHiveClaimRewardsButton
        username={sanitizedUsername}
        className="w-full sm:w-auto"
        showIcon
      />
    );
  } else if (hasHiveEngineRewards) {
    claimButton = (
      <HiveEngineClaimRewardsButton
        className="w-full sm:w-auto"
        tokenSymbol={assetSymbol}
        username={sanitizedUsername}
        showIcon
        fullWidth
        pendingRewards={data?.pendingRewards}
      />
    );
  }

  const claimSection =
    claimButton && (
      <div className="px-3 pb-3 pt-3 md:px-4">
        <div className="flex flex-col items-center text-center">{claimButton}</div>
      </div>
    );

  return (
    <div className="border-b last:border-0 border-[--border-color]">
      <div className="flex flex-col">
        <Link
          href={targetHref}
          className="block cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-dark-sky"
          onClickCapture={handleLinkClick}
        >
          <div className="grid grid-cols-4 p-3 md:p-4">
            <div className="flex items-start gap-2 md:gap-3 col-span-2 sm:col-span-1">
              <div className="mt-1">{logo}</div>
              <div>
                <div>{data?.title}</div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-gray-500 uppercase font-semibold">{data?.name}</div>
                  {data?.layer && (
                    <Badge className="!rounded-lg !p-0 !px-1" appearance="secondary">
                      {data.layer}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="hidden sm:block">
              {formattedApr && <Badge>{formattedApr}% APR</Badge>}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <FormattedCurrency value={data?.price ?? 0} fixAt={3} skipConversion />
            </div>
            <div
              className={clsx(
                "text-gray-900 dark:text-white flex items-center gap-2",
                hasDropdownOperations ? "justify-between" : "justify-start"
              )}
            >
              <div className="text-base font-semibold">{formattedAccountBalance}</div>
              {hasDropdownOperations && actionDropdown}
            </div>
          </div>
        </Link>
        {claimSection}
      </div>
      {activeOperationDialog}
    </div>
  );
}
