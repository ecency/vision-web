"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import i18next from "i18next";
import { LinearProgress, SuggestionList } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { checkAllSvg } from "@ui/svg";
import { usePromoteMutation } from "@/api/sdk-mutations";
import { usePreCheckPromote } from "@/api/mutations";
import { withFeatureFlag } from "@/core/react-query";
import { getPointsQueryOptions, getPromotePriceQueryOptions, getSearchPathQueryOptions } from "@ecency/sdk";
import { getAccessToken } from "@/utils";
import { useMount, useDebounce } from "react-use";
import { Entry } from "@/entities";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entry?: Entry;
  onHide: () => void;
}

export function Promote({ onHide, entry }: Props) {
  const { activeUser } = useActiveAccount();

  const [step, setStep] = useState(1);
  const [path, setPath] = useState("");
  const [pathQuery, setPathQuery] = useState("");
  const [debouncedPathQuery, setDebouncedPathQuery] = useState("");
  const [duration, setDuration] = useState(1);
  const [balanceError, setBalanceError] = useState("");

  useDebounce(
    () => {
      setDebouncedPathQuery(pathQuery);
    },
    500,
    [pathQuery]
  );

  const accessToken = activeUser ? (getAccessToken(activeUser.username) ?? "") : "";

  const { data: activeUserPoints, isPending: isPointsPending } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(activeUser?.username)
    )
  );
  const { data: prices, isLoading: isPricesLoading } = useQuery({
    ...getPromotePriceQueryOptions(accessToken),
    select: (data) => data.sort((a, b) => a.duration - b.duration)
  });
  const { data: paths } = useQuery(getSearchPathQueryOptions(debouncedPathQuery));

  const {
    mutateAsync: promote,
    isPending: isPromoting,
    error: promoteError,
    reset: resetPromote
  } = usePromoteMutation();
  const { mutateAsync: preCheck, error: postError, isPending: isPreCheckPending } = usePreCheckPromote(() => {});

  const inProgress = useMemo(
    () => isPromoting || isPricesLoading || isPreCheckPending,
    [isPromoting, isPricesLoading, isPreCheckPending]
  );

  const isValidPath = useCallback((p: string) => {
    if (p.indexOf("/") === -1) {
      return;
    }

    const [author, permlink] = p.replace("@", "").split("/");
    return author.length >= 3 && permlink.length >= 3;
  }, []);
  const canSubmit = useMemo(
    () => !postError && !balanceError && isValidPath(path),
    [balanceError, isValidPath, path, postError]
  );

  useMount(() => {
    if (entry) {
      setPath(`${entry.author}/${entry.permlink}`);
    }
  });

  useEffect(() => {
    if (prices && prices.length > 0) {
      setDuration(prices[1].duration);
    }
  }, [prices]);

  const price = prices?.find((x) => x.duration === duration)?.price ?? 0.0;

  useEffect(() => {
    setBalanceError(
      parseFloat(activeUserPoints?.points ?? "0.0") < price
        ? i18next.t("trx-common.insufficient-funds")
        : ""
    );
  }, [activeUser, activeUserPoints?.points, price]);

  const pathChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const path = e.target.value;
    setPath(path);

    if (path.trim().length < 3) {
      return;
    }

    setPathQuery(path);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Clear any stale promote error before a new attempt so a fresh preCheck
    // failure isn't shown alongside a previous (now irrelevant) promote error.
    resetPromote();
    try {
      await preCheck(path);
      const [author, permlink] = path.replace("@", "").split("/");
      await promote({ author, permlink, duration });
      setStep(2);
    } catch (e) {
      // preCheck and promote surface their failures via postError / promoteError
      // state; swallow here so a rejected sign/broadcast (e.g. cancelled in the
      // extension) doesn't bubble up as an unhandled promise rejection.
    }
  }, [preCheck, duration, path, promote, resetPromote]);

  const finish = () => onHide();

  return (
    <Modal show={true} centered={true} onHide={onHide} className="promote-dialog" size="lg">
      <ModalHeader thin={true} closeButton={true} />
      <ModalBody>
        <div className="promote-dialog-content">
          {step === 1 && (
            <div className={`transaction-form ${inProgress ? "in-progress" : ""}`}>
              <div className="transaction-form-header">
                <div className="step-no">1</div>
                <div className="box-titles">
                  <div className="main-title">{i18next.t("promote.title")}</div>
                  <div className="sub-title">{i18next.t("promote.sub-title")}</div>
                </div>
              </div>
              {inProgress && <LinearProgress />}
              <div className="transaction-form-body flex flex-col">
                <div className="self-center mb-4">
                  <a href="https://docs.ecency.com/ecency/boost-and-promote/#what-is-promote">{i18next.t("promote.learn-more")}</a>
                </div>
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
                      value={isPointsPending ? "..." : `${activeUserPoints?.points ?? "0"} POINTS`}
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
                  </div>
                </div>
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center">
                    <label>{i18next.t("redeem-common.post")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-10">
                    <SuggestionList items={paths ?? []} renderer={(i) => i} onSelect={(v) => setPath(v)}>
                      <FormControl
                        className={postError ? "is-invalid" : ""}
                        type="text"
                        value={path}
                        onChange={pathChanged}
                        placeholder={i18next.t("redeem-common.post-placeholder")}
                        disabled={inProgress}
                      />
                    </SuggestionList>
                    {postError && <small className="pl-3 text-red">{postError?.message}</small>}
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
                      onChange={(e) => setDuration(Number((e.target as any).value))}
                      disabled={inProgress}
                    >
                      {prices?.map((p) => {
                        const { duration: d, price: pr } = p;
                        const label = `${d} ${
                          d === 1 ? i18next.t("g.day") : i18next.t("g.days")
                        } - ${pr} POINTS`;
                        return (
                          <option value={p.duration} key={p.duration}>
                            {label}
                          </option>
                        );
                      })}
                    </FormControl>
                  </div>
                </div>
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-2 flex items-center" />
                  <div className="col-span-12 sm:col-span-10">
                    <Button onClick={handleSubmit} disabled={!canSubmit || inProgress}>
                      {i18next.t("g.next")}
                    </Button>
                    {promoteError && !postError && (
                      <small className="block pl-3 text-red">{promoteError.message}</small>
                    )}
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
