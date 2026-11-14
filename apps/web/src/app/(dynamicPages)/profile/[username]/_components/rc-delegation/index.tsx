import React, { useCallback, useState } from "react";
import { FormControl, InputGroup } from "@ui/input";
import { Button } from "@ui/button";
import { Form } from "@ui/form";
import i18next from "i18next";
import { error, LinearProgress, UserAvatar } from "@/features/shared";
import { arrowRightSvg } from "@ui/svg";
import { formatError } from "@/api/format-error";
import { useDelegateRcMutation } from "@/api/sdk-mutations";
import {
  getAccountFullQueryOptions,
  getAccountRcQueryOptions,
  getBadActorsQueryOptions
} from "@ecency/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "react-use";

export const ResourceCreditsDelegation = (props: any) => {
  const { activeUser, hideDelegation, toFromList, amountFromList, delegateeData } = props;
  const queryClient = useQueryClient();
  // The RC being delegated is the signer's own, so the balance and the limit
  // come from the logged in account, whichever profile the dialog opened on.
  const { data: resourceCredit } = useQuery({
    ...getAccountRcQueryOptions(activeUser.username),
    select: (accounts) =>
      accounts.length
        ? Number(accounts[0].rc_manabar.current_mana) + Number(accounts[0].received_delegated_rc)
        : undefined
  });
  const { data: badActors } = useQuery(getBadActorsQueryOptions());
  const { mutateAsync: delegateRc } = useDelegateRcMutation();

  const [to, setTo] = useState<string>(toFromList || "");
  const [amount, setAmount] = useState<any>(amountFromList || "");
  const [inProgress, setInProgress] = useState<boolean>(false);
  const [step, setStep] = useState<any>(1);
  const [amountError, setAmountError] = useState<string>("");
  const [toError, setToError] = useState<string>("");
  const [toWarning, setToWarning] = useState<string>("");
  const [toData, setToData] = useState<any>(delegateeData || "");

  const toChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setInProgress(true);
    setTo(value);
  };

  const amountChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { value: amount } = e.target;
    setAmount(amount);
    if (
      amount === "" ||
      (Number(amount) >= 5000000000 && Number(amount) < Number(resourceCredit)) ||
      amount === "0"
    ) {
      setAmountError("");
    } else if (Number(amount) < 5000000000) {
      setAmountError(i18next.t("rc-info.minimum-rc-error"));
    } else if (Number(amount) > Number(resourceCredit)) {
      setAmountError(i18next.t("rc-info.insufficient-rc-error"));
      return;
    }
  };

  const next = () => {
    setInProgress(false);
    setStep(2);
  };

  const back = () => {
    setStep(1);
  };

  const signTransaction = async () => {
    setInProgress(true);
    try {
      await delegateRc({ to, maxRc: `${amount}` });
      hideDelegation();
    } catch (e) {
      error(...formatError(e));
    } finally {
      setInProgress(false);
    }
  };

  const canSubmit =
    (toData || delegateeData) &&
    !toError &&
    !inProgress &&
    !amountError &&
    !!amount &&
    (Number(amount) === 0 || Number(amount) >= 5000000000) &&
    Number(amount) < Number(resourceCredit);

  const handleTo = useCallback(async (value: string) => {
    if (!value) {
      return;
    }

    if (value === "") {
      setToWarning("");
      setToError("");
      setToData(null);
      return;
    }

    if (badActors?.has(value.toLowerCase())) {
      setToWarning(i18next.t("transfer.to-bad-actor"));
    } else {
      setToWarning("");
    }
    setToData(null);

    if (value.includes(",")) {
      setToData(value);
      setToError("");
      return;
    } else {
      setInProgress(true);

      try {
        const resp = await queryClient.fetchQuery(
          getAccountFullQueryOptions(value)
        );
        if (resp) {
          setToError("");
          setToData(resp);
        } else {
          setToError(i18next.t("transfer.to-not-found"));
        }
      } catch (e) {
        error(...formatError(e));
      } finally {
        setInProgress(false);
      }
    }
  }, [badActors, queryClient]);

  useDebounce(() => handleTo(to), 3000, [to]);

  const formHeader1 = (
    <div className="transaction-form-header">
      <div className="step-no">1</div>
      <div className="box-titles">
        <div className="main-title">{i18next.t("rc-info.delegate-title")}</div>
        <div className="sub-title">{i18next.t("rc-info.delegate-sub-title")}</div>
      </div>
    </div>
  );

  const formHeader2 = (
    <div className="transaction-form-header">
      <div className="step-no">2</div>
      <div className="box-titles">
        <div className="main-title">{i18next.t("transfer.confirm-title")}</div>
        <div className="sub-title">{i18next.t("transfer.confirm-sub-title")}</div>
      </div>
    </div>
  );

  return (
    <div className="transfer-dialog-content">
      {step === 1 && (
        <div className={`transaction-form ${inProgress ? "in-progress" : ""}`}>
          {formHeader1}
          {inProgress && <LinearProgress />}
          <Form className="transaction-form-body">
            <div className="grid grid-cols-12 mb-4">
              <div className="col-span-12 sm:col-span-2 mt-3">
                <label>{i18next.t("transfer.from")}</label>
              </div>
              <div className="col-span-12 sm:col-span-10">
                <InputGroup prepend="@">
                  <FormControl type="text" value={activeUser.username} readOnly={true} />
                </InputGroup>
              </div>
            </div>

            <div className="grid grid-cols-12 mb-4">
              <div className="col-span-12 sm:col-span-2 mt-3">
                <label>{i18next.t("transfer.to")}</label>
              </div>
              <div className="col-span-12 sm:col-span-10">
                {/* <SuggestionList > */}
                <InputGroup prepend="@">
                  <FormControl
                    type="text"
                    autoFocus={to === ""}
                    placeholder={i18next.t("transfer.to-placeholder")}
                    value={to}
                    onChange={toChanged}
                    className={toError ? "is-invalid" : ""}
                  />
                </InputGroup>
                {/* </SuggestionList> */}

                {toWarning && (
                  <small className="text-warning-default tr-form-text">{toWarning}</small>
                )}
                {toError && <small className="text-red tr-form-text">{toError}</small>}
              </div>
            </div>

            <div className="grid grid-cols-12">
              <div className="col-span-12 sm:col-span-2 mt-3">
                <label>{i18next.t("transfer.amount")}</label>
              </div>
              <div className="col-span-12 sm:col-span-10">
                <InputGroup prepend="#">
                  <FormControl
                    type="text"
                    placeholder={i18next.t("transfer.amount-placeholder")}
                    value={amount}
                    onChange={amountChanged}
                    className={
                      Number(amount) > Number(resourceCredit) && amountError ? "is-invalid" : ""
                    }
                  />
                </InputGroup>
              </div>
            </div>

            {amount < 5000000000 && <small className="text-red tr-form-text">{amountError}</small>}
            {amount > Number(resourceCredit) && (
              <small className="text-red tr-form-text">{amountError}</small>
            )}

            <div className="grid grid-cols-12">
              <div className="col-span-12 lg:col-span-10 lg:col-start-3">
                <div className="balance space-3">
                  <span className="balance-label">{i18next.t("transfer.balance")}</span>
                  <span>{resourceCredit === undefined ? "" : `: ${resourceCredit}`}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 mb-4">
              <div className="col-span-12 sm:col-span-10 sm:col-start-3">
                <Button disabled={!canSubmit} onClick={next}>
                  {i18next.t("g.next")}
                </Button>
              </div>
            </div>
          </Form>
        </div>
      )}

      {step === 2 && (
        <div className="transaction-form">
          {formHeader2}
          <div className="transaction-form-body">
            <div className="confirmation">
              <div className="confirm-title">Delegate</div>
              <div className="users">
                <div className="from-user">
                  <UserAvatar username={activeUser.username} size="large" />
                </div>
                {
                  <>
                    <div className="arrow">{arrowRightSvg}</div>
                    <div className="to-user">
                      <UserAvatar username={to} size="large" />
                    </div>
                  </>
                }
              </div>
              <div className="amount">{amount} RC</div>
            </div>
            <div className="flex justify-center">
              <Button appearance="secondary" outline={true} disabled={inProgress} onClick={back}>
                {i18next.t("g.back")}
              </Button>
              <span className="hr-6px-btn-spacer" />
              <Button disabled={inProgress} onClick={signTransaction}>
                {i18next.t("transfer.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
