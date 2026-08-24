import i18next from "i18next";
import {
  ProfileWalletHpDelegationPromo,
  ProfileWalletHpGovernancePromo,
  ProfileWalletPromoCarousel,
  ProfileWalletTokenHistoryCard,
} from "../../_components";
import {
  getAccountDelegationsQueryOptions,
  getAccountFullQueryOptions,
  getAccountWalletAssetInfoQueryOptions,
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { ReceivedVesting } from "./received-vesting-dialog";
import { useEffect, useMemo, useState } from "react";
import { DelegatedVesting } from "./delegated-vesting-dialog";
import { Transfer } from "@/features/shared/transfer";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import useLocalStorage from "react-use/lib/useLocalStorage";

const HP_PROMO_STORAGE_KEY_PREFIX = "hpDelegationPromoDismissed";
const GOVERNANCE_PROMO_STORAGE_KEY_PREFIX = "hpGovernancePromoDismissed";
const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;
const ECENCY_ACCOUNT = "ecency";

const isWithin30Days = (timestamp: number | null | undefined) =>
  !!timestamp && Date.now() - timestamp < THIRTY_DAYS_IN_MS;

interface Props {
  username: string;
}

// Pinned locale so SSR and client render identically (avoids the React #418
// hydration mismatch -> removeChild crash; see format-asset-balance).
const format = new Intl.NumberFormat("en-US");

export function HpDelegationsCard({ username }: Props) {
  const { data } = useQuery(getAccountWalletAssetInfoQueryOptions(username, "HP"));

  const [showDelegated, setShowDelegated] = useState(false);
  const [showReceived, setShowReceived] = useState(false);
  const [showDelegateDialog, setShowDelegateDialog] = useState(false);

  const { activeUser } = useActiveAccount();
  const isOwnProfile = activeUser?.username === username;

  const curationStorageKey = `${HP_PROMO_STORAGE_KEY_PREFIX}:${username || "unknown"}`;
  const [curationDismissedAt, setCurationDismissedAt, removeCurationDismissedAt] =
    useLocalStorage<number | null>(curationStorageKey, null);

  const governanceStorageKey = `${GOVERNANCE_PROMO_STORAGE_KEY_PREFIX}:${username || "unknown"}`;
  const [governanceDismissedAt, setGovernanceDismissedAt, removeGovernanceDismissedAt] =
    useLocalStorage<number | null>(governanceStorageKey, null);

  const isCurationDismissed = useMemo(
    () => isWithin30Days(curationDismissedAt),
    [curationDismissedAt]
  );
  const isGovernanceDismissed = useMemo(
    () => isWithin30Days(governanceDismissedAt),
    [governanceDismissedAt]
  );

  useEffect(() => {
    if (curationDismissedAt && Date.now() - curationDismissedAt >= THIRTY_DAYS_IN_MS) {
      removeCurationDismissedAt();
    }
  }, [curationDismissedAt, removeCurationDismissedAt]);

  useEffect(() => {
    if (
      governanceDismissedAt &&
      Date.now() - governanceDismissedAt >= THIRTY_DAYS_IN_MS
    ) {
      removeGovernanceDismissedAt();
    }
  }, [governanceDismissedAt, removeGovernanceDismissedAt]);

  const { data: fullAccount } = useQuery({
    ...getAccountFullQueryOptions(username),
    enabled: isOwnProfile,
  });
  const hasEcencyProxy = fullAccount?.proxy === ECENCY_ACCOUNT;

  const { data: hasDelegatedToEcency = false } = useQuery({
    ...getAccountDelegationsQueryOptions(username),
    enabled: isOwnProfile && !hasEcencyProxy,
    select: (data) =>
      !!data?.outgoing_delegations?.some(
        (delegation) =>
          delegation.delegatee === ECENCY_ACCOUNT &&
          Number(delegation.amount) > 0
      ),
  });

  const showCurationPromo = isOwnProfile && !isCurationDismissed;
  const showGovernancePromo =
    isOwnProfile &&
    !hasEcencyProxy &&
    !isGovernanceDismissed &&
    hasDelegatedToEcency;

  const outgoingDelegations =
    data?.parts?.find((part) =>
      ["outgoing_delegations", "delegating"].includes(part.name)
    )?.balance ?? 0;
  const incomingDelegations =
    data?.parts?.find((part) =>
      ["incoming_delegations", "received"].includes(part.name)
    )?.balance ?? 0;

  return (
    <>
      <ProfileWalletTokenHistoryCard title={i18next.t("profile-wallet.delegations")}>
        <div className="grid grid-cols-2 gap-2 md:gap-4 px-4 pb-4">
          <div
            className="bg-gray-100 dark:bg-gray-900 p-2 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 duration-300"
            role="button"
            tabIndex={0}
            onClick={() => setShowDelegated(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowDelegated(true);
              }
            }}
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {i18next.t("profile-wallet.delegations-outgoing")}
            </div>
            <div className="text-xl font-bold">{format.format(outgoingDelegations)}</div>
          </div>
          <div
            className="bg-gray-100 dark:bg-gray-900 p-2 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 duration-300"
            role="button"
            tabIndex={0}
            onClick={() => setShowReceived(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowReceived(true);
              }
            }}
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {i18next.t("profile-wallet.delegations-incoming")}
            </div>
            <div className="text-xl font-bold">{format.format(incomingDelegations)}</div>
          </div>
        </div>
        {(showCurationPromo || showGovernancePromo) && (
          <div className="px-4 pb-4">
            <ProfileWalletPromoCarousel
              slides={[
                showCurationPromo && (
                  <ProfileWalletHpDelegationPromo
                    key="curation"
                    onDelegate={() => setShowDelegateDialog(true)}
                    onDismiss={() => setCurationDismissedAt(Date.now())}
                  />
                ),
                showGovernancePromo && (
                  <ProfileWalletHpGovernancePromo
                    key="governance"
                    onDismiss={() => setGovernanceDismissedAt(Date.now())}
                    onProxySet={() => setGovernanceDismissedAt(Date.now())}
                  />
                ),
              ]}
            />
          </div>
        )}
      </ProfileWalletTokenHistoryCard>
      <ReceivedVesting username={username} show={showReceived} setShow={setShowReceived} />
      <DelegatedVesting
        username={username}
        show={showDelegated}
        setShow={setShowDelegated}
        totalDelegated={`${outgoingDelegations}`}
      />
      {showDelegateDialog && (
        <Transfer
          mode="delegate"
          asset="HP"
          to="ecency"
          onHide={() => setShowDelegateDialog(false)}
        />
      )}
    </>
  );
}
