import { LoginRequired, error } from "@/features/shared";
import { Button } from "@ui/button";
import i18next from "i18next";
import { contentLoadSvg, contentSaveSvg } from "@/assets/img/svg";
import { EcencyConfigManager } from "@/config";
import { DraftsDialog } from "@/features/shared/drafts";
import React, { useCallback } from "react";
import { usePublishApi, useSaveDraftApi, useScheduleApi, useUpdateApi } from "@/app/submit/_api";
import { makeEntryPath } from "@/utils";
import { formatError } from "@/api/format-error";
import { BeneficiaryRoute, Draft, Entry, RewardType } from "@/entities";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { RcPrecheckBanner } from "@/features/shared/rc-precheck";

interface Props {
  editingEntry: Entry | null;
  editingDraft: Draft | null;
  schedule: string;
  onClear: () => void;
  isDraftEmpty: boolean;
  drafts: boolean;
  setDrafts: (value: boolean) => void;
  title: string;
  tags: string[];
  body: string;
  reward: RewardType;
  reblogSwitch: boolean;
  beneficiaries: BeneficiaryRoute[];
  description: string | null;
  selectedThumbnail: string | undefined;
  validate: () => boolean;
  /**
   * Saving a draft is a weaker promise than publishing one, so it gets its own
   * check: `validate` is the publish gate and rejects anything without a title,
   * tags and a body.
   */
  validateDraft: () => boolean;
  onDraftCreated?: (draft: Draft) => void;
}

export function EditorActions({
  schedule,
  onClear,
  editingEntry,
  editingDraft,
  isDraftEmpty,
  drafts,
  setDrafts,
  title,
  body,
  tags,
  reblogSwitch,
  reward,
  beneficiaries,
  description,
  selectedThumbnail,
  validate,
  validateDraft,
  onDraftCreated
}: Props) {
  const { activeUser } = useActiveAccount();
  const router = useRouter();

  const { mutateAsync: doSchedule, isPending: scheduling } = useScheduleApi(onClear);
  const { mutateAsync: saveDraft, isPending: savingDraft } = useSaveDraftApi(onDraftCreated);
  const { mutateAsync: publish, isPending: publishing } = usePublishApi(onClear);
  const { mutateAsync: update, isPending: updating } = useUpdateApi(onClear);
  const cancelUpdate = useCallback(() => {
    if (!editingEntry) {
      return;
    }

    const newLoc = makeEntryPath(
      editingEntry?.category!,
      editingEntry.author,
      editingEntry.permlink
    );
    router.push(newLoc);
  }, [editingEntry, router]);

  return schedule ? (
    <div className="flex items-center justify-end gap-2 p-2">
      <LoginRequired>
        <Button
          size="sm"
          isLoading={scheduling}
          loadingText={i18next.t("submit.scheduling")}
          iconPlacement="left"
          onClick={() => {
            if (!validate()) {
              return;
            }

            doSchedule({
              title,
              tags,
              body,
              reward,
              reblogSwitch,
              beneficiaries,
              schedule,
              description,
              selectedThumbnail
            }).catch((err) => error(...formatError(err)));
          }}
        >
          {i18next.t("submit.schedule")}
        </Button>
      </LoginRequired>
    </div>
  ) : (
    <>
      {editingEntry === null && (
        <RcPrecheckBanner operation="comment_operation" className="mx-2 mt-2" />
      )}
      <div className="flex items-center justify-end border-b border-[--border-color] gap-2 p-2">
        {editingEntry === null && (
          <>
            {isDraftEmpty ? (
              <EcencyConfigManager.Conditional
                condition={({ visionFeatures }) => visionFeatures.drafts.enabled}
              >
                <LoginRequired>
                  <Button
                    size="sm"
                    outline={true}
                    className="mr-[6px]"
                    onClick={() => setDrafts(!drafts)}
                    icon={contentLoadSvg}
                    iconPlacement="left"
                    isLoading={savingDraft}
                    loadingText={i18next.t("submit.saving")}
                  >
                    {i18next.t("submit.load-draft")}
                  </Button>
                </LoginRequired>
              </EcencyConfigManager.Conditional>
            ) : (
              <LoginRequired>
                <Button
                  size="sm"
                  outline={true}
                  className="mr-[6px]"
                  icon={contentSaveSvg}
                  iconPlacement="left"
                  isLoading={savingDraft}
                  loadingText={i18next.t("submit.saving")}
                  onClick={() => {
                    if (!validateDraft()) {
                      return;
                    }
                    saveDraft({
                      tags,
                      title,
                      body,
                      description,
                      selectedThumbnail,
                      editingDraft,
                      beneficiaries,
                      reward
                    }).catch((err) => error(...formatError(err)));
                  }}
                >
                  {editingDraft === null
                    ? i18next.t("submit.save-draft")
                    : i18next.t("submit.update-draft")}
                </Button>
              </LoginRequired>
            )}
            <LoginRequired>
              <Button
                size="sm"
                isLoading={publishing}
                loadingText={i18next.t("submit.publishing")}
                iconPlacement="left"
                onClick={() => {
                  if (!validate()) {
                    return;
                  }

                  publish({
                    reblogSwitch,
                    title,
                    tags,
                    body,
                    description,
                    reward,
                    beneficiaries,
                    selectedThumbnail
                  }).catch((err) => error(...formatError(err)));
                }}
              >
                {i18next.t("submit.publish")}
              </Button>
            </LoginRequired>
          </>
        )}
        {activeUser && <DraftsDialog show={drafts} setShow={setDrafts} />}

        {editingEntry !== null && (
          <>
            <Button size="sm" appearance="secondary" outline={true} onClick={cancelUpdate}>
              {i18next.t("submit.cancel-update")}
            </Button>
            <LoginRequired>
              <Button
                size="sm"
                isLoading={updating}
                loadingText={i18next.t("submit.updating")}
                onClick={() => {
                  if (!validate()) {
                    return;
                  }

                  update({
                    editingEntry,
                    tags,
                    title,
                    body,
                    description,
                    selectedThumbnail
                  }).catch((err) => error(...formatError(err)));
                }}
              >
                {i18next.t("submit.update")}
              </Button>
            </LoginRequired>
          </>
        )}
      </div>
    </>
  );
}
