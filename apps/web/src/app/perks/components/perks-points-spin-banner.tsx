"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import { PointsSpin, SPIN_VALUES } from "@/features/points";
import { error, success } from "@/features/shared";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, StyledTooltip } from "@/features/ui";
import { delay, getAccessToken } from "@/utils";
import { getGameStatusCheckQueryOptions, useGameClaim } from "@ecency/sdk";
import * as Sentry from "@sentry/nextjs";
import { useQuery } from "@tanstack/react-query";
import { UilMoneyStack, UilSpin } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { useCallback, useState } from "react";
import { PerksBasicCard } from "./perks-basic-card";
import { PerksPointsSpinCountdown } from "./perks-points-spin-countdown";

export function PerksPointsSpinBanner() {
  const { activeUser } = useActiveAccount();

  const [showSpinner, setShowSpinner] = useState(false);
  // A claim takes about a second and the button used to stay live for all of it,
  // so a second click sent the same spin again and the loser came back as an error
  // on a spin that had in fact been rewarded. The button is disabled while a claim
  // is being processed, and after a successful one until a status newer than that
  // claim has loaded: the status on screen still offers the spin that was just used.
  const [isClaiming, setIsClaiming] = useState(false);
  const [lastClaim, setLastClaim] = useState<{ username?: string; at: number }>();

  const { data, refetch, dataUpdatedAt } = useQuery(
    getGameStatusCheckQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? ""),
      "spin"
    )
  );
  const {
    mutateAsync: claim,
    isPending,
    data: claimData
  } = useGameClaim(
    activeUser?.username,
    getAccessToken(activeUser?.username ?? ""),
    "spin",
    data?.key ?? ""
  );

  const claimGame = useCallback(async () => {
    // The claim rejects on any edge/proxy failure, and an uncaught rejection out of
    // this click handler is what surfaced as ECENCY-NEXT-1FCJ. Surface it to the
    // user instead, and do not run the success toast or the refetch on a failure.
    // Report it explicitly: catching it removes the unhandled-rejection signal, and
    // the SDK now throws a stable message so the group stays a single Sentry issue
    // instead of one per gateway page.
    setIsClaiming(true);
    try {
      try {
        await claim();
      } catch (e) {
        Sentry.captureException(e, { extra: { route: "/private-api/post-game" } });
        error(i18next.t("perks.spin-error"));
        return;
      }
      setLastClaim({ username: activeUser?.username, at: Date.now() });
      await delay(1000);
      refetch();
      success(i18next.t("perks.spin-success"));
    } finally {
      setIsClaiming(false);
    }
  }, [activeUser?.username, claim, refetch]);

  // scoped to the account that claimed: after an account switch the other account's
  // status is not stale just because it was loaded before this claim
  const isStatusStale =
    !!lastClaim && lastClaim.username === activeUser?.username && dataUpdatedAt < lastClaim.at;
  const canSpin = typeof data?.remaining === "number" && data.remaining > 0;

  return (
    <>
      <PerksBasicCard
        className="p-4 flex flex-col lg:flex-row items-center gap-4 md:hover:!rotate-0 cursor-pointer"
        onClick={() => setShowSpinner(true)}
      >
        <Image src="/assets/undraw-gifts.svg" width={240} height={120} alt="" />
        <div className="flex flex-col gap-4 md:gap-6">
          <div>
            <div className="md:text-lg font-bold">{i18next.t("perks.spin-title")}</div>
            <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
              {i18next.t("perks.spin-description")}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="lg" icon={<UilMoneyStack />}>
              {i18next.t("perks.spin-now")}
            </Button>
            <StyledTooltip content="Available soon">
              <Button appearance="gray" size="lg" disabled={true}>
                {i18next.t("perks.want-more-spins")}
              </Button>
            </StyledTooltip>
          </div>
        </div>
      </PerksBasicCard>
      <Modal centered={true} show={showSpinner} onHide={() => setShowSpinner(false)}>
        <ModalHeader closeButton={true}>
          <div>
            Spin and <span className="text-blue-dark-sky">Win!</span>
          </div>
        </ModalHeader>
        <ModalBody className="flex flex-col items-center gap-4 md:gap-8 justify-center">
          <PointsSpin startSpin={isPending} options={SPIN_VALUES} destination={claimData?.score} />
        </ModalBody>
        <ModalFooter className="flex justify-between items-center">
          <div>
            {data?.remaining ?? 0} {i18next.t("perks.spins-left")}
          </div>
          <Button
            disabled={!canSpin || isClaiming || isStatusStale}
            appearance="success"
            size="lg"
            icon={canSpin ? <UilSpin /> : undefined}
            onClick={claimGame}
          >
            <PerksPointsSpinCountdown />
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
