import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import numeral from "numeral";
import { usePathname, useRouter } from "next/navigation";
import { usePrevious } from "react-use";
import { SearchSuggester, SuggestionGroup } from "../../search-suggester";
import { SearchBox } from "../../search-box";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import i18next from "i18next";
import { Transfer, TransferAsset, TransferMode } from "@/features/shared/transfer";
import { useQuery } from "@tanstack/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { getPointsQueryOptions, useClaimPoints } from "@ecency/sdk";
import { useClaimRewardsMutation } from "@/api/sdk-mutations";
import { success, error } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { formatNumber, getAccessToken } from "@/utils";
import { BookmarksDialog } from "@/features/shared/bookmarks";
import { DraftsDialog } from "@/features/shared/drafts";
import { GalleryDialog } from "@/features/shared/gallery";
import { EcencyConfigManager } from "@/config";

interface Props {
  containerClassName?: string;
  autoFocus?: boolean;
}

export function Search({ containerClassName, autoFocus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const previousPathname = usePrevious(pathname);

  const searchIndexCount = useGlobalStore((state) => state.searchIndexCount);
  const { activeUser } = useActiveAccount();
  const toggleUiProp = useGlobalStore((state) => state.toggleUiProp);

  const [query, setQuery] = useState("");
  const [quickTransferConfig, setQuickTransferConfig] = useState<
    { asset: TransferAsset; mode: TransferMode } | undefined
  >(undefined);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  const isBookmarksEnabled = useMemo(
    () => EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.bookmarks.enabled),
    []
  );
  const isDraftsEnabled = useMemo(
    () => EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.drafts.enabled),
    []
  );
  const isGalleryEnabled = useMemo(
    () => EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.gallery.enabled),
    []
  );
  const isDecksEnabled = useMemo(
    () => EcencyConfigManager.selector(({ visionFeatures }) => visionFeatures.decks.enabled),
    []
  );

  const username = activeUser?.username;

  const { data: accountData } = useQuery({
    ...getAccountFullQueryOptions(username ?? ""),
    enabled: Boolean(username)
  });

  const { data: pointsData } = useQuery({
    ...getPointsQueryOptions(username),
    enabled: Boolean(username)
  });

  const { mutateAsync: claimHiveRewards, isPending: isClaimingHiveRewards } = useClaimRewardsMutation();

  const { mutateAsync: claimPoints, isPending: isClaimingPoints } = useClaimPoints(
    username,
    getAccessToken(username ?? ""),
    () => success(i18next.t("points.claim-ok")),
    (err) => error(...formatError(err))
  );

  const pendingHiveRewards = useMemo(() => {
    const parseBalance = (balance?: string) => {
      if (!balance) {
        return 0;
      }

      const [value] = balance.split(" ");
      const parsed = Number.parseFloat(value ?? "0");
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const hive = parseBalance(accountData?.reward_hive_balance);
    const hbd = parseBalance(accountData?.reward_hbd_balance);
    const vesting = parseBalance(accountData?.reward_vesting_balance);

    return {
      hive,
      hbd,
      vesting,
      hasAny: hive > 0 || hbd > 0 || vesting > 0
    };
  }, [accountData?.reward_hbd_balance, accountData?.reward_hive_balance, accountData?.reward_vesting_balance]);

  const pendingPoints = useMemo(() => {
    if (!pointsData?.uPoints) {
      return 0;
    }

    const parsed = Number.parseFloat(pointsData.uPoints);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [pointsData?.uPoints]);

  const hasPendingPoints = pendingPoints > 0;

  const placeholder = useMemo(
    () =>
      searchIndexCount > 0
        ? i18next.t("search.placeholder-count", {
            n: numeral(searchIndexCount).format("0,0")
          })
        : i18next.t("search.placeholder"),
    [searchIndexCount]
  );

  useEffect(() => {
    if (pathname !== previousPathname) {
      setQuery("");
    }
  }, [pathname, previousPathname]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.keyCode === 13) {
      if (["/search-more", "/search-more/"].includes(location.pathname)) {
        router.push(`/search-more/?q=${encodeURIComponent(query)}`);
      } else {
        router.push(`/search/?q=${encodeURIComponent(query)}`);
      }
    }
  };

  const ensureAuthenticated = useCallback(() => {
    if (!username) {
      toggleUiProp("login", true);
      return false;
    }

    return true;
  }, [toggleUiProp, username]);

  const handleTransferAction = useCallback(
    (asset: TransferAsset) => {
      if (!ensureAuthenticated()) {
        return;
      }

      setQuickTransferConfig({ asset, mode: "transfer" });
    },
    [ensureAuthenticated]
  );

  const handleClaimHiveRewards = useCallback(async () => {
    if (!ensureAuthenticated() || isClaimingHiveRewards || !pendingHiveRewards.hasAny) {
      return;
    }

    try {
      if (!accountData) {
        return;
      }
      await claimHiveRewards({
        rewardHive: accountData.reward_hive_balance,
        rewardHbd: accountData.reward_hbd_balance,
        rewardVests: accountData.reward_vesting_balance,
      });
      success(i18next.t("wallet.claim-reward-balance-ok"));
    } catch (e) {
      error(...formatError(e));
    }
  }, [
    accountData,
    claimHiveRewards,
    ensureAuthenticated,
    isClaimingHiveRewards,
    pendingHiveRewards.hasAny
  ]);

  const handleClaimPoints = useCallback(async () => {
    if (!ensureAuthenticated() || isClaimingPoints || !hasPendingPoints) {
      return;
    }

    try {
      await claimPoints({});
    } catch (e) {
      error(...formatError(e));
    }
  }, [claimPoints, ensureAuthenticated, hasPendingPoints, isClaimingPoints]);

  const handleOpenBookmarks = useCallback(() => {
    if (!ensureAuthenticated()) {
      return;
    }

    setShowBookmarks(true);
  }, [ensureAuthenticated]);

  const handleOpenDrafts = useCallback(() => {
    if (!ensureAuthenticated()) {
      return;
    }

    setShowDrafts(true);
  }, [ensureAuthenticated]);

  const handleOpenGallery = useCallback(() => {
    if (!ensureAuthenticated()) {
      return;
    }

    setShowGallery(true);
  }, [ensureAuthenticated]);

  const handleDelegateHivePower = useCallback(() => {
    if (!ensureAuthenticated()) {
      return;
    }

    setQuickTransferConfig({ asset: "HP", mode: "delegate" });
  }, [ensureAuthenticated]);

  const handleHivePowerAction = useCallback(
    (mode: Extract<TransferMode, "power-up" | "power-down">) => {
      if (!ensureAuthenticated()) {
        return;
      }

      setQuickTransferConfig({ asset: mode === "power-up" ? "HIVE" : "HP", mode });
    },
    [ensureAuthenticated]
  );

  const buildQuickActions = useCallback(
    (value: string): SuggestionGroup[] => {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return [];
      }

      const actions: {
        label: string;
        description?: string;
        onSelect: () => void;
      }[] = [];

      const matchesKeyword = (...keywords: string[]) =>
        keywords.some((keyword) => normalized.includes(keyword));
      const addAction = (
        action: {
          label: string;
          description?: string;
          onSelect: () => void;
        }
      ) => {
        if (!actions.find((existing) => existing.label === action.label)) {
          actions.push(action);
        }
      };

      if (matchesKeyword("transfer", "send", "pay")) {
        addAction({
          label: i18next.t("search.action-transfer-hive"),
          description: i18next.t("search.action-transfer-description", { token: "HIVE" }),
          onSelect: () => handleTransferAction("HIVE")
        });
        addAction({
          label: i18next.t("search.action-transfer-hbd"),
          description: i18next.t("search.action-transfer-description", { token: "HBD" }),
          onSelect: () => handleTransferAction("HBD")
        });
        addAction({
          label: i18next.t("search.action-transfer-points"),
          description: i18next.t("search.action-transfer-description", { token: "POINTS" }),
          onSelect: () => handleTransferAction("POINT")
        });
      }

      if (matchesKeyword("delegate", "delegation")) {
        addAction({
          label: i18next.t("search.action-delegate-hp"),
          description: i18next.t("search.action-delegate-hp-description"),
          onSelect: handleDelegateHivePower
        });
      }

      if (matchesKeyword("power up", "power-up", "powerup", "stake")) {
        addAction({
          label: i18next.t("search.action-power-up"),
          description: i18next.t("search.action-power-up-description"),
          onSelect: () => handleHivePowerAction("power-up")
        });
      }

      if (matchesKeyword("power down", "power-down", "powerdown", "unstake")) {
        addAction({
          label: i18next.t("search.action-power-down"),
          description: i18next.t("search.action-power-down-description"),
          onSelect: () => handleHivePowerAction("power-down")
        });
      }

      if (matchesKeyword("claim")) {
        if (pendingHiveRewards.hasAny) {
          const rewardSegments = [
            accountData?.reward_hive_balance,
            accountData?.reward_hbd_balance,
            accountData?.reward_vesting_balance
          ]
            .filter((segment) => {
              if (!segment) {
                return false;
              }

              const [value] = segment.split(" ");
              const parsed = Number.parseFloat(value ?? "0");
              return Number.isFinite(parsed) && parsed > 0;
            })
            .join(" · ");

          actions.push({
            label: i18next.t("search.action-claim-hive"),
            description: rewardSegments || undefined,
            onSelect: handleClaimHiveRewards
          });
        }

        if (hasPendingPoints) {
          actions.push({
            label: i18next.t("search.action-claim-points"),
            description: `${formatNumber(pendingPoints, 3)} POINTS`,
            onSelect: handleClaimPoints
          });
        }
      }

      if (matchesKeyword("signup", "sign-up", "register")) {
        addAction({
          label: i18next.t("search.action-signup-email"),
          onSelect: () => router.push("/signup/free")
        });
        addAction({
          label: i18next.t("search.action-signup-crypto"),
          onSelect: () => router.push("/signup/wallet")
        });
      }

      if (matchesKeyword("community", "communities")) {
        addAction({
          label: i18next.t("search.action-browse-communities"),
          onSelect: () => router.push("/communities")
        });
        addAction({
          label: i18next.t("search.action-visit-ecency-community"),
          onSelect: () => router.push("/trending/hive-125125")
        });
      }

      if (matchesKeyword("swap", "trade", "trading", "exchange")) {
        addAction({
          label: i18next.t("search.action-market-swap"),
          description: i18next.t("search.action-market-swap-description"),
          onSelect: () => router.push("/market/swap")
        });
        addAction({
          label: i18next.t("search.action-market-trade"),
          description: i18next.t("search.action-market-trade-description"),
          onSelect: () => router.push("/market/advanced")
        });
        addAction({
          label: i18next.t("search.action-market-exchange"),
          description: i18next.t("search.action-market-exchange-description"),
          onSelect: () => router.push("/market")
        });
      }

      if (matchesKeyword("witness", "witnesses", "block producer", "block producers")) {
        addAction({
          label: i18next.t("search.action-witnesses"),
          description: i18next.t("search.action-witnesses-description"),
          onSelect: () => router.push("/witnesses")
        });
      }

      if (matchesKeyword("proposal", "proposals", "dhf", "decentralized fund", "decentralized funds")) {
        addAction({
          label: i18next.t("search.action-proposals"),
          description: i18next.t("search.action-proposals-description"),
          onSelect: () => router.push("/proposals")
        });
      }

      const isMyQuery =
        normalized === "my" ||
        normalized.startsWith("my ") ||
        normalized.startsWith("my-") ||
        normalized.includes(" my ");

      if (username && isMyQuery) {
        addAction({
          label: i18next.t("search.action-my-profile"),
          onSelect: () => router.push(`/@${username}`)
        });

        if (isBookmarksEnabled) {
          addAction({
            label: i18next.t("search.action-my-bookmarks"),
            onSelect: handleOpenBookmarks
          });
        }

        if (isDraftsEnabled) {
          addAction({
            label: i18next.t("search.action-my-drafts"),
            onSelect: handleOpenDrafts
          });
        }

        if (isGalleryEnabled) {
          addAction({
            label: i18next.t("search.action-my-gallery"),
            onSelect: handleOpenGallery
          });
        }

        if (isDecksEnabled) {
          addAction({
            label: i18next.t("search.action-my-decks"),
            onSelect: () => router.push("/decks")
          });
        }

        addAction({
          label: i18next.t("search.action-my-communities"),
          onSelect: () => router.push(`/@${username}/communities`)
        });

        addAction({
          label: i18next.t("search.action-my-blog"),
          onSelect: () => router.push(`/@${username}/blog`)
        });

        addAction({
          label: i18next.t("search.action-my-wallet"),
          onSelect: () => router.push(`/@${username}/wallet`)
        });
      }

      if (actions.length === 0) {
        return [];
      }

      return [
        {
          header: i18next.t("search.header-actions"),
          items: actions,
          renderer: (item: (typeof actions)[number]) => (
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
              {item.description && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{item.description}</span>
              )}
            </div>
          ),
          onSelect: (item: (typeof actions)[number]) => item.onSelect()
        }
      ];
    }, [
      accountData?.reward_hbd_balance,
      accountData?.reward_hive_balance,
      accountData?.reward_vesting_balance,
      handleClaimHiveRewards,
      handleClaimPoints,
      handleTransferAction,
      handleDelegateHivePower,
      handleHivePowerAction,
      handleOpenBookmarks,
      handleOpenDrafts,
      handleOpenGallery,
      hasPendingPoints,
      pendingHiveRewards.hasAny,
      pendingPoints,
      router,
      isBookmarksEnabled,
      isDecksEnabled,
      isDraftsEnabled,
      isGalleryEnabled,
      username
    ]
  );

  return (
    <>
      <SearchSuggester
        value={query}
        containerClassName={containerClassName}
        changed={true}
        extraSuggestions={buildQuickActions}
      >
        <SearchBox
          placeholder={placeholder}
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value.toLowerCase())}
          onKeyDown={onKeyDown}
          autoComplete="non-autocomplete-field"
          name="non-autocomplete-field"
          id="non-autocomplete-field"
          autoFocus={autoFocus}
        />
      </SearchSuggester>

      {quickTransferConfig && (
        <Transfer
          asset={quickTransferConfig.asset}
          mode={quickTransferConfig.mode}
          onHide={() => setQuickTransferConfig(undefined)}
        />
      )}

      {isBookmarksEnabled && (
        <BookmarksDialog show={showBookmarks && !!username} setShow={setShowBookmarks} />
      )}

      {isDraftsEnabled && (
        <DraftsDialog show={showDrafts && !!username} setShow={setShowDrafts} />
      )}

      {isGalleryEnabled && (
        <GalleryDialog show={showGallery && !!username} setShow={setShowGallery} />
      )}
    </>
  );
}
