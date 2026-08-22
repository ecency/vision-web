"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { SearchByUsername } from "../search-by-username";
import dayjs from "@/utils/dayjs";
import { getBoostPlusPricesQueryOptions, getPointsQueryOptions, getBoostPlusAccountPricesQueryOptions } from "@ecency/sdk";
import { getAccessToken } from "@/utils";
import i18next from "i18next";
import { LinearProgress } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { checkAllSvg } from "@ui/svg";
import { useQuery } from "@tanstack/react-query";
import { withFeatureFlag } from "@/core/react-query";
import { useBoostPlusMutation } from "@/api/sdk-mutations";

interface Props {
  onHide: () => void;
}

export function BoostDialog({ onHide }: Props) {
  const { activeUser } = useActiveAccount();

  const accessToken = (activeUser ? getAccessToken(activeUser.username) : "") ?? "";

  const { data: prices } = useQuery({
    ...getBoostPlusPricesQueryOptions(accessToken),
    select: (data) => data.sort((a, b) => a.duration - b.duration)
  });

  const [step, setStep] = useState(1);
  const [duration, setDuration] = useState(0);
  const [account, setAccount] = useState("");

  const { mutateAsync: boostPlus, isPending: isBoostPending } = useBoostPlusMutation();

  const { data: activeUserPoints } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(activeUser?.username)
    )
  );
  const { data: alreadyBoostAccount } = useQuery(
    getBoostPlusAccountPricesQueryOptions(account, accessToken)
  );

  const price = useMemo(
    () => prices?.find((x) => x.duration === duration)?.price ?? 0,
    [prices, duration]
  );
  const balanceError = useMemo(
    () =>
      parseFloat(activeUserPoints?.points ?? "0") < price
        ? i18next.t("trx-common.insufficient-funds")
        : "",
    [activeUserPoints?.points, price]
  );
  const isAlreadyBoosted = useMemo(
    () =>
      alreadyBoostAccount && alreadyBoostAccount.expires
        ? dayjs(alreadyBoostAccount.expires).isAfter(dayjs())
        : false,
    [alreadyBoostAccount]
  );
  const canSubmit = useMemo(
    () => !balanceError && !isAlreadyBoosted && account.length > 0 && duration > 0,
    [balanceError, isAlreadyBoosted, account, duration]
  );

  const inProgress = isBoostPending;

  useEffect(() => {
    if (prices && prices.length > 0) {
      setDuration(prices![0].duration);
    }
  }, [prices]);

  const isSubmittingRef = useRef(false);
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await boostPlus({ account, duration });
      setStep(2);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [account, duration, boostPlus]);

  const finish = () => onHide();

  return (
    <Modal show={true} centered={true} onHide={onHide} className="boost-dialog" size="lg">
      <ModalHeader thin={true} closeButton={true} />
      <ModalBody>
        <div className="promote-dialog-content">
          {step === 1 && (
            <div className={`transaction-form ${inProgress ? "in-progress" : ""}`}>
              <div className="transaction-form-header">
                <div className="step-no">1</div>
                <div className="box-titles">
                  <div className="main-title">{i18next.t("boost-plus.title")}</div>
                  <div className="sub-title">{i18next.t("boost-plus.sub-title")}</div>
                </div>
              </div>
              {inProgress && <LinearProgress />}
              <div className="transaction-form-body flex flex-col">
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center">
                    <label>{i18next.t("redeem-common.balance")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-10">
                    <FormControl
                      type="text"
                      className={`balance-input ${balanceError ? "is-invalid" : ""}`}
                      plaintext={true}
                      readOnly={true}
                      value={`${activeUserPoints?.points ?? "0.000"} POINTS`}
                    />
                    {balanceError && (
                      <div className="flex items-center flex-wrap gap-3 mt-1">
                        <small className="pl-3 text-red">{balanceError}</small>
                        <PointsTopupCta
                          required={price}
                          available={parseFloat(activeUserPoints?.points ?? "0")}
                        />
                      </div>
                    )}
                    {isAlreadyBoosted && (
                      <div>
                        <small className="pl-3 text-red">
                          {i18next.t("boost-plus.already-boosted-account")}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center">
                    <label>{i18next.t("redeem-common.account")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-10">
                    <SearchByUsername setUsername={(value: string) => setAccount(value)} />
                  </div>
                </div>
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center">
                    <label>{i18next.t("promote.duration")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-10">
                    <FormControl
                      type="select"
                      value={duration}
                      onChange={(e: ChangeEvent<any>) => setDuration(+e.target.value)}
                      disabled={inProgress}
                    >
                      {prices?.map(({ price, duration }) => (
                        <option value={duration} key={duration}>
                          {`${duration} ${
                            duration === 1 ? i18next.t("g.day") : i18next.t("g.days")
                          } - ${price} POINTS`}
                        </option>
                      ))}
                    </FormControl>
                  </div>
                </div>
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center" />
                  <div className="col-span-12 sm:col-span-10">
                    <Button onClick={handleSubmit} disabled={!canSubmit || inProgress}>
                      {i18next.t("g.next")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={`transaction-form ${inProgress ? "in-progress" : ""}`}>
              <div className="transaction-form-header">
                <div className="step-no">2</div>
                <div className="box-titles">
                  <div className="main-title">{i18next.t("trx-common.success-title")}</div>
                  <div className="sub-title">{i18next.t("trx-common.success-sub-title")}</div>
                </div>
              </div>
              {inProgress && <LinearProgress />}
              <div className="transaction-form-body">
                <p className="flex justify-center align-content-center">
                  <span className="svg-icon text-green [&>svg]:size-4">{checkAllSvg}</span>{" "}
                  {i18next.t("redeem-common.success-message")}
                </p>
                <div className="flex justify-center">
                  <Button onClick={finish}>{i18next.t("g.finish")}</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
