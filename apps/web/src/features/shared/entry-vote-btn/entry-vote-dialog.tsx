import React, { useCallback, useEffect, useRef, useState } from "react";
import * as ls from "@/utils/local-storage";
import { Button } from "@ui/button";
import i18next from "i18next";
import { EntryTipBtn, FormattedCurrency } from "@/features/shared";
import { getVoteValue, setVoteValue } from "@/features/shared/entry-vote-btn/utils";
import { InputVote } from "@ui/input";
import { getDynamicPropsQueryOptions, votingPower, votingValue } from "@ecency/sdk";
import { Account, Entry } from "@/entities";
import { Spinner } from "@ui/spinner";
import { useActiveAccount } from "@/core/hooks";
import { useQuery } from "@tanstack/react-query";
import { RcPrecheckBanner } from "@/features/shared/rc-precheck";

import { SliderChevron } from "@/features/shared/slider-chevron";
type Mode = "up" | "down";

interface VoteDialogProps {
  account?: Account;
  entry: Entry;
  downVoted: boolean;
  upVoted: boolean;
  isPostSlider?: boolean;
  previousVotedValue: number | undefined;
  setTipDialogMounted: (d: boolean) => void;
  onClick: (percent: number, estimated: number) => void;
  handleClickAway: () => void;
  isVoted: { upVoted: boolean; downVoted: boolean };
  isVotingLoading: boolean;
}

export function EntryVoteDialog({
  entry,
  previousVotedValue,
  upVoted,
  isPostSlider,
  downVoted,
  onClick,
  isVoted,
  setTipDialogMounted,
  handleClickAway,
  account,
  isVotingLoading
}: VoteDialogProps) {
  const { username, account: activeAccount, isLoading: isAccountLoading } = useActiveAccount();
  const { data: dynamicProps } = useQuery(getDynamicPropsQueryOptions());

  const getUpVotedValue = useCallback(
    () =>
      getVoteValue(
        "up",
        username! + "-" + entry.post_id,
        getVoteValue("upPrevious", username!, 100, isPostSlider),
        isPostSlider
      ),
    [username, entry.post_id, isPostSlider]
  );
  const getDownVotedValue = useCallback(
    () =>
      getVoteValue(
        "down",
        username! + "-" + entry.post_id,
        getVoteValue("downPrevious", username!, -1, isPostSlider),
        isPostSlider
      ),
    [username, entry.post_id, isPostSlider]
  );

  const [mode, setMode] = useState<Mode>(downVoted ? "down" : "up");
  const [upSliderVal, setUpSliderVal] = useState(
    upVoted && previousVotedValue ? previousVotedValue : getUpVotedValue()
  );
  const [downSliderVal, setDownSliderVal] = useState(
    downVoted && previousVotedValue ? previousVotedValue : getDownVotedValue()
  );
  const [initialVoteValues, setInitialVoteValues] = useState({
    up: upVoted && previousVotedValue ? previousVotedValue : getUpVotedValue(),
    down: downVoted && previousVotedValue ? previousVotedValue : getDownVotedValue()
  });
  const [wrongValueUp, setWrongValueUp] = useState(false);
  const [wrongValueDown, setWrongValueDown] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // The parent now opens this dialog immediately and resolves the user's
  // previous vote in the background (so the open isn't blocked on a network
  // fetch — an INP win), where it used to mount this dialog only after the value
  // was already known. The slider is therefore interactive before the value
  // arrives. When it arrives, apply it to the slider the same way the initial
  // state above would have — but only the first time, and never once the user
  // has actually started adjusting the slider, so a slow fetch can't reset a
  // weight they already chose.
  //
  // `userTouchedRef` is flipped from real pointer/keyboard input on the slider
  // (capture phase, below). InputVote calls setValue() programmatically on mount
  // and on clamp, so a handler-based "touched" flag would false-trigger; DOM
  // input events do not fire for those programmatic echoes.
  const appliedPreviousRef = useRef(false);
  const userTouchedRef = useRef(false);
  const markTouched = useCallback(() => {
    userTouchedRef.current = true;
  }, []);
  useEffect(() => {
    if (appliedPreviousRef.current || !previousVotedValue) {
      return;
    }
    appliedPreviousRef.current = true;
    if (userTouchedRef.current) {
      return;
    }
    if (upVoted) {
      setUpSliderVal(previousVotedValue);
      setInitialVoteValues((v) => ({ ...v, up: previousVotedValue }));
    } else if (downVoted) {
      setDownSliderVal(previousVotedValue);
      setInitialVoteValues((v) => ({ ...v, down: previousVotedValue }));
    }
  }, [previousVotedValue, upVoted, downVoted]);

  const isPaidOut = entry.is_paidout;

  const upSliderChanged = useCallback(
    (value: number) => {
      const upSliderVal = Number(value.toFixed(1));
      setUpSliderVal(upSliderVal);
      setWrongValueUp(upSliderVal === initialVoteValues.up && upVoted);
      setShowRemove(upSliderVal === 0 && upVoted);
      setShowWarning(
        (upSliderVal < initialVoteValues.up || upSliderVal > initialVoteValues.up) &&
          upSliderVal > 0 &&
          upVoted
      );
    },
    [initialVoteValues.up, upVoted]
  );

  const downSliderChanged = useCallback(
    (value: number) => {
      const downSliderVal = Number(value.toFixed(1));
      setDownSliderVal(downSliderVal);
      setWrongValueDown(downSliderVal === initialVoteValues.down && downVoted);
      setShowRemove(downSliderVal === 0 && downVoted);
      setShowWarning(
        (downSliderVal > initialVoteValues.down || downSliderVal < initialVoteValues.down) &&
          downSliderVal < 0 &&
          downVoted
      );
    },
    [downVoted, initialVoteValues.down]
  );

  const estimate = (percent: number): number => {
    if (isAccountLoading || !activeAccount || !dynamicProps) {
      return 0;
    }

    const sign = percent < 0 ? -1 : 1;
    const vPower = votingPower(activeAccount) * 100; // 0-100 → 0-10000
    const weight = Math.abs(percent) * 100; // slider 0-100 → 0-10000

    return votingValue(activeAccount, dynamicProps, vPower, weight) * sign;
  };

  const upVoteClicked = useCallback(() => {
    const { upVoted } = isVoted;
    if (!upVoted || (upVoted && initialVoteValues.up !== upSliderVal)) {
      const estimated = Number(estimate(upSliderVal).toFixed(3));
      onClick(upSliderVal, estimated);
      setVoteValue("up", `${username!}-${entry.post_id}`, upSliderVal);
      setVoteValue("upPrevious", `${username!}-${entry.post_id}`, upSliderVal);
      setWrongValueUp(false);
      setWrongValueDown(false);
      ls.set(isPostSlider ? "post_upSlider_value" : "comment_upSlider_value", upSliderVal);
    } else if (upVoted && initialVoteValues.up === upSliderVal) {
      setWrongValueUp(true);
      setWrongValueDown(false);
    }
  }, [
    username,
    entry.post_id,
    estimate,
    initialVoteValues.up,
    isPostSlider,
    isVoted,
    onClick,
    upSliderVal
  ]);

  const downVoteClicked = useCallback(() => {
    const { downVoted } = isVoted;
    const downSliderValue = downSliderVal * -1;

    if (!downVoted || (downVoted && initialVoteValues.down !== downSliderValue)) {
      const estimated = Number(estimate(downSliderValue).toFixed(3));
      onClick(downSliderValue, estimated);
      setWrongValueDown(false);
      setWrongValueUp(false);
      setVoteValue("down", `${username!}-${entry.post_id}`, downSliderValue);
      setVoteValue("downPrevious", `${username!}-${entry.post_id}`, downSliderValue);
      ls.set(isPostSlider ? "post_downSlider_value" : "comment_downSlider_value", downSliderVal);
    } else if (downVoted && initialVoteValues.down === downSliderValue) {
      setWrongValueDown(true);
      setWrongValueUp(false);
    }
  }, [
    username,
    downSliderVal,
    entry.post_id,
    estimate,
    initialVoteValues.down,
    isPostSlider,
    isVoted,
    onClick
  ]);

  return (
    <>
      {/* The [&_svg] sink replaces the deleted btn-vote mixin svg rule that
          sized the banner's alert icon to 14px inside this dialog. */}
      {!isPaidOut && (
        <RcPrecheckBanner
          operation="vote_operation"
          payload={
            username
              ? {
                  kind: "vote",
                  op: { voter: username, author: entry.author, permlink: entry.permlink }
                }
              : undefined
          }
          compact
          className="mb-2 [&_svg]:size-3.5"
        />
      )}
      {!isPaidOut && mode === "up" && (
        <>
          <div className="voting-controls voting-controls-up">
            {isVotingLoading ? <Spinner className="size-3.5" /> : (
              <Button
                noPadding={true}
                className="w-8"
                size="xs"
                icon={<SliderChevron direction="up" />}
                onClick={upVoteClicked}
                outline={true}
                aria-label={i18next.t("entry-list-item.upvote", { defaultValue: "Upvote" })}
              />
            )}
            <div className="estimated">
              <FormattedCurrency value={estimate(upSliderVal)} fixAt={3} />
            </div>
            <div className="space" />
            <div
              className="slider slider-up"
              onMouseDownCapture={markTouched}
              onTouchStartCapture={markTouched}
              onKeyDownCapture={markTouched}
            >
              <InputVote value={upSliderVal} setValue={(x) => upSliderChanged(x)} />
            </div>
            <div className="percentage" />
            {!isVotingLoading && (
              <Button
                noPadding={true}
                className="w-8"
                appearance="danger"
                outline={true}
                size="xs"
                icon={<SliderChevron direction="down" />}
                onClick={() => setMode("down")}
                aria-label={i18next.t("entry-list-item.switch-to-downvote", { defaultValue: "Switch to downvote" })}
              />
            )}
          </div>
          {wrongValueUp && (
            <div className="vote-error">
              <p>{i18next.t("entry-list-item.vote-error")}</p>
            </div>
          )}
          {showWarning && (
            <div className="vote-warning">
              <p>{i18next.t("entry-list-item.vote-warning")}</p>
            </div>
          )}
          {showRemove && (
            <div className="vote-remove">
              <p>{i18next.t("entry-list-item.vote-remove")}</p>
            </div>
          )}
        </>
      )}

      {!isPaidOut && mode === "down" && (
        <>
          <div className="voting-controls voting-controls-down">
            {!isVotingLoading && (
              <Button
                noPadding={true}
                className="w-8"
                size="xs"
                icon={<SliderChevron direction="up" />}
                onClick={() => setMode("up")}
                outline={true}
                aria-label={i18next.t("entry-list-item.switch-to-upvote", { defaultValue: "Switch to upvote" })}
              />
            )}
            <div className="estimated">
              <FormattedCurrency value={estimate(downSliderVal)} fixAt={3} />
            </div>
            <div
              className="slider slider-down"
              onMouseDownCapture={markTouched}
              onTouchStartCapture={markTouched}
              onKeyDownCapture={markTouched}
            >
              <InputVote
                mode="negative"
                value={downSliderVal}
                setValue={(x) => downSliderChanged(x)}
              />
            </div>
            <div className="space" />
            <div className="percentage" />
            {isVotingLoading ? <Spinner className="size-3.5" /> : (
              <Button
                noPadding={true}
                className="w-8"
                size="xs"
                appearance="danger"
                outline={true}
                icon={<SliderChevron direction="down" />}
                onClick={downVoteClicked}
                aria-label={i18next.t("entry-list-item.downvote", { defaultValue: "Downvote" })}
              />
            )}
          </div>

          {wrongValueDown && (
            <div className="vote-error">
              <p>{i18next.t("entry-list-item.vote-error")}</p>
            </div>
          )}
          {showWarning && (
            <div className="vote-warning">
              <p>{i18next.t("entry-list-item.vote-warning")}</p>
            </div>
          )}
          {showRemove && (
            <div className="vote-remove">
              <p>{i18next.t("entry-list-item.vote-remove")}</p>
            </div>
          )}
        </>
      )}

      {isPaidOut && (
        <div className="vote-error error-message">
          <span>{i18next.t("entry-list-item.old-post-error")}</span>
          <span>{i18next.t("entry-list-item.old-post-error-suggestion")}</span>
          <div className="tipping-icon inline-flex ml-1">
            <EntryTipBtn
              account={account}
              entry={entry}
              setTipDialogMounted={setTipDialogMounted}
              handleClickAway={handleClickAway}
              inlineTipButton={true}
            />
          </div>
        </div>
      )}
    </>
  );
}
