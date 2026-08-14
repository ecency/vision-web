"use client";

import { SUBMIT_TAG_MAX_LENGTH } from "@/app/submit/_consts";
import { TagSelector, sanitizeTagInput } from "@/app/submit/_components";
import { Alert, Button, FormControl } from "@/features/ui";
import { formatError } from "@/api/format-error";
import { isShortfallStillRelevant, resolveRcShortfall, type RcShortfall } from "../_utils/rc-shortfall";
import { useRcTopupAction } from "@/features/shared/rc-topup/use-rc-topup-action";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { handleAndReportError, error as feedbackError } from "@/features/shared";
import { UilMultiply } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";
import { usePublishApi, useScheduleApi } from "../_api";
import { usePublishState } from "../_hooks";
import { PublishActionBarCommunity } from "./publish-action-bar-community";
import { PublishScheduleDialog } from "./publish-schedule-dialog";
import { PublishValidatePostMeta } from "./publish-validate-post-meta";
import { PublishValidatePostThumbnailPicker } from "./publish-validate-post-thumbnail-picker";
import { isCommunity } from "@/utils";
import { wordOverlapSimilarity } from "@/utils/text-similarity";
import { hasPublishContent } from "../_utils/content";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { AvailableCredits } from "@/features/shared";
import { RcPrecheckBanner } from "@/features/shared/rc-precheck";
import type { RcPrecheckPayload } from "@ecency/sdk";
import {
  canFitBeneficiary,
  isSupportEcencyRow,
  SUPPORT_ECENCY_ACCOUNT,
  SUPPORT_ECENCY_DEFAULT_PERCENT,
  useSupportEcencySettingsQuery
} from "@/features/support-ecency";

const TEMPLATE_SIMILARITY_THRESHOLD = 0.9;

interface Props {
  onClose: () => void;
  onSuccess: (step: "published" | "scheduled", entryInfo?: { title: string; author: string; permlink: string; category: string }) => void;
}

export function PublishValidatePost({ onClose, onSuccess }: Props) {
  const {
    tags,
    setTags,
    schedule,
    clearAll,
    content,
    metaDescription,
    setMetaDescription,
    isReblogToCommunity,
    setIsReblogToCommunity,
    beneficiaries,
    setBeneficiaries,
    title,
    appliedTemplateBody
  } = usePublishState();

  const { activeUser } = useActiveAccount();
  const [rcShortfall, setRcShortfall] = useState<RcShortfall | null>(null);
  const { openTopup, dialog: rcTopupDialog } = useRcTopupAction(rcShortfall?.username);
  const isMounted = useRef(true);
  const { data: supportSettings } = useSupportEcencySettingsQuery();

  const supportWeight = SUPPORT_ECENCY_DEFAULT_PERCENT * 100;
  // One-tap support chip: shown only when the stored preference is off, the
  // post has no ecency beneficiary yet and one more row still fits the Hive
  // limits. Adding it affects this post only; the preference is not saved.
  const showSupportChip = useMemo(
    () =>
      !!activeUser?.username &&
      activeUser.username !== SUPPORT_ECENCY_ACCOUNT &&
      (supportSettings?.beneficiary_percent ?? 0) === 0 &&
      !beneficiaries?.some(isSupportEcencyRow) &&
      canFitBeneficiary(beneficiaries, supportWeight),
    [activeUser?.username, beneficiaries, supportSettings?.beneficiary_percent, supportWeight]
  );

  const [showSchedule, setShowSchedule] = useState(false);

  const beneficiaryReward = useMemo(
    () =>
      isCommunity(tags?.[0])
        ? beneficiaries?.find((ben) => ben.account === tags?.[0])?.weight
        : undefined,
    [beneficiaries, tags]
  );

  const isMostlyTemplate = useMemo(
    () =>
      !!appliedTemplateBody &&
      wordOverlapSimilarity(content ?? "", appliedTemplateBody) >= TEMPLATE_SIMILARITY_THRESHOLD,
    [appliedTemplateBody, content]
  );

  const { mutateAsync: publishNow, isPending: isPublishPending } = usePublishApi();
  const { mutateAsync: scheduleNow, isPending: isSchedulePending } = useScheduleApi();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // An alert raised for one account must not linger while another is active.
  useEffect(() => {
    setRcShortfall((current) =>
      isShortfallStillRelevant(current, activeUser?.username) ? current : null
    );
  }, [activeUser?.username]);

  // The draft itself, so the warning prices this post rather than an average
  // one. Body length is the dominant term, which is also the lever the author
  // can actually pull.
  const rcPayload = useMemo<RcPrecheckPayload | undefined>(() => {
    if (!activeUser?.username) {
      return undefined;
    }
    return {
      kind: "comment",
      op: {
        author: activeUser.username,
        // The real permlink is generated at broadcast time from the title;
        // only its length feeds the estimate, so derive a same-shape one.
        permlink: (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64),
        parent_author: "",
        parent_permlink: tags?.[0] ?? "",
        title: title ?? "",
        body: content ?? "",
        json_metadata: JSON.stringify({ tags: tags ?? [] })
      },
      options: beneficiaries?.length ? { beneficiaries } : undefined
    };
  }, [activeUser?.username, tags, title, content, beneficiaries]);

  const submit = useCallback(async () => {
    if (!title?.trim()) {
      feedbackError(i18next.t("submit.empty-title-alert"));
      return;
    }

    if (!hasPublishContent(content)) {
      feedbackError(i18next.t("submit.empty-body-alert"));
      return;
    }

    setRcShortfall(null);

    try {
      if (schedule) {
        await scheduleNow(schedule!);

        onSuccess("scheduled");
      } else {
        const [entry] = await publishNow();

        onSuccess("published", entry ? {
          title: entry.title,
          author: entry.author,
          permlink: entry.permlink,
          category: entry.category
        } : undefined);
      }

      clearAll();
    } catch (err) {
      // Keep the classified type: handleAndReportError returns true for known
      // types WITHOUT showing anything, leaving the toast to us. Dropping the
      // type here meant an out-of-RC publish rendered a bare "Insufficient
      // Resource Credits." with no way to act on it, when the feedback toast
      // already knows how to offer an account boost for exactly that type.
      const [message, errorType] = formatError(err);
      // A toast disappears; running out of RC is a blocking condition the user
      // has to act on, so it also stays on the page next to the button that
      // failed, with a route to top up. Bound to the account that failed, and
      // guarded because this runs after awaited work.
      const shortfall = resolveRcShortfall(err, activeUser?.username);
      if (shortfall && isMounted.current) {
        setRcShortfall(shortfall);
      }
      const handled = handleAndReportError(err, "publish-post");
      if (handled) {
        feedbackError(message || i18next.t("g.server-error"), errorType);
      } else {
        throw err;
      }
    }
  }, [
    clearAll,
    content,
    onSuccess,
    publishNow,
    schedule,
    scheduleNow,
    title
  ]);

  useMount(() => {
    // Built through `new RegExp` because a unicode-flagged regex literal is not allowed
    // by this project's ES5 compilation target. The pattern itself is unchanged.
    const hashtagRegex = new RegExp("#([\\p{L}\\p{N}\\p{M}_-]+)", "gu");
    const computedTags = Array.from(content ? content.matchAll(hashtagRegex) : [])
      .map(([, tag]) => sanitizeTagInput(tag).slice(0, SUBMIT_TAG_MAX_LENGTH).trim())
      .filter((tag) => !!tag);

    const normalizedExistingTags = (tags ?? [])
      .map((tag) => sanitizeTagInput(tag).slice(0, SUBMIT_TAG_MAX_LENGTH).trim())
      .filter((tag) => !!tag);

    const uniqueTagsSet = new Set([...normalizedExistingTags, ...computedTags]);
    setTags(Array.from(uniqueTagsSet).slice(0, 10));
  });

  useEffect(() => {
    if (!content) return;

    // Only generate description if it's empty or 1-char garbage
    if (!metaDescription || metaDescription.trim().length <= 1) {
      // Strip HTML tags including unclosed forms (`<[^>]*(?:>|$)`) so a
      // truncated `…<script` substring can't leak into the meta tag.
      // Loop catches nested payloads like `<scr<script>ipt>`.
      let stripped = content;
      let prev: string;
      do {
        prev = stripped;
        stripped = stripped.replace(/<[^>]*(?:>|$)/g, "");
      } while (stripped !== prev);

      const plainText = stripped.replace(/\s+/g, " ").trim();
      const description = plainText.slice(0, 160);
      setMetaDescription(description);
    }
  }, [content]);

  return (
    <div className="animate-fade-in-up publish-page max-w-[1024px] mx-auto pb-20 sm:pb-0">
      <div className="col-span-2 justify-end flex p-4">
        <Button
          appearance="gray"
          icon={<UilMultiply />}
          size="sm"
          className="h-[36px]"
          onClick={onClose}
          aria-label={i18next.t("g.close", { defaultValue: "Close" })}
        />
      </div>
      <div className="px-2 py-4 sm:px-4 md:p-6 lg:p-8 bg-white rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
        <div className="flex flex-col gap-4">
          <div className="text-lg font-semibold mb-4">{i18next.t("publish.story-preview")}</div>
          <PublishValidatePostThumbnailPicker />
          <PublishValidatePostMeta />
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {i18next.t("publish.public-info-hint")}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:gap-6 lg:gap-7 items-start">
          <PublishActionBarCommunity />

          <div className="flex flex-col gap-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {i18next.t("publish.tags-hint")}
            </div>
            <TagSelector
              tags={tags ?? []}
              maxItem={10}
              onChange={(tags) => setTags(tags)}
            />
            {!tags?.length && (
              <div className="text-sm text-red">{i18next.t("publish.tags-min-message")}</div>
            )}
          </div>

          {isCommunity(tags?.[0]) && (
            <div className="text-sm">
              <FormControl
                type="checkbox"
                isToggle={true}
                id="reblog-switch"
                label={i18next.t("submit.reblog")}
                checked={isReblogToCommunity ?? false}
                onChange={(v) => {
                  setIsReblogToCommunity(v);
                }}
              />
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {i18next.t("submit.reblog-hint")}
              </div>
            </div>
          )}

          {(beneficiaryReward ?? 0) / 100 > 25 && (
            <Alert className="w-full" appearance="warning">
              {i18next.t("publish.community-beneficiary.hint")}
            </Alert>
          )}

          {isMostlyTemplate && (
            <Alert className="w-full" appearance="warning">
              {i18next.t("post-templates.similarity-warning")}
            </Alert>
          )}

          {showSupportChip && (
            <Button
              size="xs"
              appearance="gray"
              className="rounded-full"
              onClick={() =>
                setBeneficiaries([
                  ...(beneficiaries ?? []),
                  { account: SUPPORT_ECENCY_ACCOUNT, weight: supportWeight }
                ])
              }
            >
              {i18next.t("support-ecency.add-chip")}
            </Button>
          )}

          {rcShortfall && (
            <Alert className="w-full flex flex-col gap-3 items-start" appearance="danger">
              <span>{rcShortfall.message}</span>
              {/*
                Both routes out of this state, rather than only the Boost page:
                spend Points on an RC-only delegation to your own account, or
                buy Points with a card when the balance is short.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" appearance="primary" onClick={openTopup}>
                  {i18next.t("rc-precheck.top-up")}
                </Button>
                <PointsTopupCta />
              </div>
            </Alert>
          )}
          {rcTopupDialog}

          {activeUser?.username && (
            <div className="w-full flex flex-col gap-2">
              <RcPrecheckBanner operation="comment_operation" payload={rcPayload} />
              <AvailableCredits username={activeUser.username} operation="comment_operation" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="lg"
              disabled={!tags?.length || isPublishPending || isSchedulePending}
              onClick={submit}
              isLoading={isPublishPending || isSchedulePending}
            >
              {!isPublishPending && !isSchedulePending
                ? schedule
                  ? i18next.t("publish.schedule-now")
                  : i18next.t("publish.publish-now")
                : ""}
              {isPublishPending && i18next.t("submit.publishing")}
              {isSchedulePending && i18next.t("submit.scheduling")}
            </Button>
            <Button size="sm" appearance="gray-link" onClick={() => setShowSchedule(true)}>
              {schedule
                ? i18next.t("publish.update-schedule")
                : i18next.t("publish.schedule-later")}
            </Button>
          </div>
        </div>
      </div>

      <PublishScheduleDialog show={showSchedule} setShow={setShowSchedule} />
    </div>
  );
}
