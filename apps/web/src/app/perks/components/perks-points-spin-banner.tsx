"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import { PointsSpin, SPIN_VALUES } from "@/features/points";
import { error, success } from "@/features/shared";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, StyledTooltip } from "@/features/ui";
import { delay, getAccessToken } from "@/utils";
import { getGameStatusCheckQueryOptions, useGameClaim } from "@ecency/sdk";
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

  const { data, refetch } = useQuery(
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
    try {
      await claim();
    } catch {
      error(i18next.t("perks.spin-error"));
      return;
    }
    await delay(1000);
    refetch();
    success(i18next.t("perks.spin-success"));
  }, [claim, refetch]);

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
            disabled={typeof data?.remaining !== "number"}
            appearance="success"
            size="lg"
            icon={typeof data?.remaining !== "number" ? undefined : <UilSpin />}
            onClick={claimGame}
          >
            <PerksPointsSpinCountdown />
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
