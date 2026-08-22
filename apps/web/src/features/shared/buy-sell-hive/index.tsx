"use client";

import React, { useCallback, useRef, useState } from "react";
import { error } from "../feedback";
import { formatError } from "@/api/format-error";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Button } from "@ui/button";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { BuySellHiveTransactionType } from "@/enums";
import { useLimitOrderCreateMutation, useLimitOrderCancelMutation } from "@/api/sdk-mutations";
import { formatNumber } from "@/utils/format-number";
import { LinearProgress } from "@/features/shared";

interface Props {
  type: BuySellHiveTransactionType;
  onHide: () => void;
  values?: { total: number; amount: number; price: number; available: number };
  onTransactionSuccess: () => void;
  orderid?: any;
}

export function BuySellHiveDialog({
  onHide,
  type,
  orderid,
  values: { amount, price, total, available } = {
    amount: 0,
    price: 0,
    total: 0,
    available: 0
  },
  onTransactionSuccess
}: Props) {
  const { activeUser } = useActiveAccount();

  const [step, setStep] = useState(1);

  const { mutateAsync: limitOrderCreate, isPending: isCreatePending } =
    useLimitOrderCreateMutation();
  const { mutateAsync: limitOrderCancel, isPending: isCancelPending } =
    useLimitOrderCancelMutation();

  const inProgress = isCreatePending || isCancelPending;
  const isSigningRef = useRef(false);

  const sign = useCallback(async () => {
    if (isSigningRef.current) return;
    isSigningRef.current = true;
    try {
      if (type === BuySellHiveTransactionType.Cancel && orderid) {
        await limitOrderCancel({ orderId: orderid });
      } else {
        const expiration = new Date(Date.now());
        expiration.setDate(expiration.getDate() + 27);
        const expirationStr = expiration.toISOString().split(".")[0];

        const orderId = Number(
          `${Math.floor(Date.now() / 1000)
            .toString()
            .slice(2)}`
        );

        const amountToSell =
          type === BuySellHiveTransactionType.Buy
            ? `${formatNumber(total, 3)} HBD`
            : `${formatNumber(amount, 3)} HIVE`;

        const minToReceive =
          type === BuySellHiveTransactionType.Buy
            ? `${formatNumber(amount, 3)} HIVE`
            : `${formatNumber(total, 3)} HBD`;

        await limitOrderCreate({
          amountToSell,
          minToReceive,
          fillOrKill: false,
          expiration: expirationStr,
          orderId
        });
      }
      setStep(2);
      onTransactionSuccess();
    } catch (err) {
      error(...formatError(err));
      onHide();
    } finally {
      isSigningRef.current = false;
    }
  }, [type, orderid, total, amount, limitOrderCreate, limitOrderCancel, onTransactionSuccess, onHide]);

  const finish = () => {
    onHide();
  };

  const formHeader1 = (
    <div className="flex items-center border-b border-[--border-color] pb-3">
      <div className="step-no ml-3">{step}</div>
      <div className="grow">
        <div className="main-title">{i18next.t("transfer.confirm-title")}</div>
        <div className="sub-title">{i18next.t("transfer.confirm-sub-title")}</div>
      </div>
    </div>
  );

  const formHeader4 = (
    <div className="transaction-form-header">
      <div className="step-no">{step}</div>
      <div className="box-titles">
        <div className="main-title">{i18next.t("trx-common.success-title")}</div>
        <div className="sub-title">{i18next.t("trx-common.success-sub-title")}</div>
      </div>
    </div>
  );

  return (
    <Modal show={true} centered={true} onHide={onHide} className="transfer-dialog" size="lg">
      <ModalHeader closeButton={true} />
      <ModalBody>
        {step === 1 && (
          <div className="mb-3">
            {formHeader1}
            <div className="flex justify-center">
              {type === BuySellHiveTransactionType.Cancel ? (
                <div className="mt-5 w-75 text-center sub-title whitespace-pre-wrap">
                  {i18next.t("market.confirm-cancel", { orderid: orderid })}
                </div>
              ) : (
                <div className="mt-5 w-75 text-center sub-title whitespace-pre-wrap">
                  {available < (type === BuySellHiveTransactionType.Buy ? total : amount)
                    ? i18next.t("market.transaction-low")
                    : i18next.t("market.confirm-buy", {
                        amount,
                        price,
                        total,
                        balance: parseFloat((available - total) as any).toFixed(3)
                      })}
                </div>
              )}
            </div>
            {available < (type === BuySellHiveTransactionType.Buy ? total : amount) ? (
              <></>
            ) : (
              <div className="flex justify-end mt-5">
                <div className="flex">
                  <Button appearance="secondary" className="mr-3" onClick={onHide}>
                    {i18next.t("g.cancel")}
                  </Button>
                  <Button
                    onClick={sign}
                    disabled={inProgress}
                    appearance={type === BuySellHiveTransactionType.Cancel ? "danger" : "primary"}
                  >
                    {inProgress
                      ? i18next.t("market.signing")
                      : i18next.t("g.continue")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="transaction-form">
            {formHeader4}
            <div className="transaction-form-body flex flex-col items-center">
              <div className="my-5 w-75 text-center sub-title whitespace-pre-wrap">
                {i18next.t("market.transaction-succeeded")}
              </div>
              <div className="flex justify-center">
                <span className="hr-6px-btn-spacer" />
                <Button onClick={finish}>{i18next.t("g.finish")}</Button>
              </div>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
