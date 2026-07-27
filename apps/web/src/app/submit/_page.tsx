"use client";

import { hasThreeSpeakEmbed } from "@/api/threespeak-embed";
import { useActiveAccount } from "@/core/hooks/use-active-account";

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PostBase } from "./_types";
import {
  BodyVersioningManager,
  useAdvancedManager,
  useApiDraftDetector,
  useBodyVersioningManager,
  useCommunityDetector,
  useEntryDetector,
  useLocalDraftManager
} from "./_hooks";
import { postBodySummary, proxifyImageSrc } from "@ecency/render-helper";
import useLocalStorage from "react-use/lib/useLocalStorage";
import usePrevious from "react-use/lib/usePrevious";
import dayjs from "@/utils/dayjs";
import isEqual from "react-fast-compare";
import { handleShortcuts } from "./_functions";
import {
  BeneficiaryEditorDialog,
  CommunitySelector,
  EditorActions,
  EditorPanelActions,
  PostSchedulerDialog,
  SubmitPreviewContent,
  TagSelector,
  WordCount
} from "@/app/submit/_components";
import "./_index.scss";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { PollsContext, PollsManager } from "@/app/submit/_hooks/polls-manager";
import { FullHeight } from "@/features/ui";
import { AvailableCredits } from "@/features/shared/available-credits";
import { EditorToolbar, toolbarEventListener } from "@/features/shared/editor-toolbar";
import { error, Feedback } from "@/features/shared/feedback";
import { Navbar } from "@/features/shared/navbar";
import { Theme } from "@/features/shared/theme";
import i18next from "i18next";
import { extractMetaData, isCommunity } from "@/utils";
import { Draft, Entry, RewardType } from "@/entities";
import { TextareaAutocomplete } from "@/features/shared/textarea-autocomplete";
import { useEntryPollExtractor } from "@/features/polls";
import { useSupportEcencyBeneficiaryInjection } from "@/features/support-ecency";
import { PREFIX } from "@/utils/local-storage";
import { useRouter } from "next/navigation";
import { EcencyConfigManager } from "@/config";
import {
  SUBMIT_DESCRIPTION_MAX_LENGTH,
  SUBMIT_TAG_MAX_LENGTH,
  SUBMIT_TITLE_MAX_LENGTH,
  SUBMIT_TOUR_ITEMS
} from "@/app/submit/_consts";
import { checkSvg } from "@ui/svg";

interface Props {
  path: string;
  username?: string;
  permlink?: string;
  draftId?: string;
  searchParams?: Record<string, string | undefined>;
}

function Submit({ path, draftId, username, permlink, searchParams }: Props) {
  const postBodyRef = useRef<HTMLDivElement | null>(null);
  const { setActivePoll, activePoll, clearActivePoll } = useContext(PollsContext);
  const { body, setBody } = useBodyVersioningManager();

  const router = useRouter();
  const { activeUser } = useActiveAccount();
  const previousActiveUser = usePrevious(activeUser);

  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>();
  // Thumbnails extracted from uploaded 3Speak videos. Held separately because they are not
  // present in the body, so the body driven recompute below cannot rediscover them. Keyed by
  // the embed they belong to, so removing the video also removes its thumbnail.
  const [videoThumbnails, setVideoThumbnails] = useState<
    { embedUrl: string; thumbUrl: string }[]
  >([]);
  const [preview, setPreview] = useState<PostBase>({
    title: "",
    tags: [],
    body: "",
    description: ""
  });
  const [disabled, setDisabled] = useState(true);
  const [drafts, setDrafts] = useState(false);
  const [isDraftEmpty, setIsDraftEmpty] = useState(false);
  const [forceReactivateTour, setForceReactivateTour] = useState(false);

  // Misc
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [isTourFinished] = useLocalStorage(PREFIX + `_itf_submit`, false);

  const postPoll = useEntryPollExtractor(editingEntry);

  const tourEnabled = useMemo(() => !activeUser, [activeUser]);
  const introSteps = useMemo(() => SUBMIT_TOUR_ITEMS, []);

  let _updateTimer: any; // todo think about it

  const applyTitle = useCallback(
    (value: string) => {
      setTitle(value.slice(0, SUBMIT_TITLE_MAX_LENGTH));
    },
    [setTitle]
  );

  const sanitizeTags = useCallback((tagList: string[]) => {
    const trimmed = tagList
      .map((tag) => tag.slice(0, SUBMIT_TAG_MAX_LENGTH))
      .filter((tag) => tag);
    return trimmed.filter((tag, index) => trimmed.indexOf(tag) === index);
  }, []);

  const applyTags = useCallback(
    (nextTags: string[]) => {
      setTags(sanitizeTags(nextTags));
    },
    [sanitizeTags, setTags]
  );

  const { setLocalDraft } = useLocalDraftManager(
    path,
    username,
    permlink,
    draftId,
    setIsDraftEmpty,
    (title, tags, body) => {
      applyTitle(title);
      applyTags(tags);
      setBody(body);
    }
  );
  const {
    advanced,
    setAdvanced,
    reward,
    setReward,
    description,
    setDescription: setAdvancedDescription,
    reblogSwitch,
    setReblogSwitch,
    beneficiaries,
    setBeneficiaries,
    schedule,
    setSchedule,
    clearAdvanced,
    getHasAdvanced
  } = useAdvancedManager();

  // The in-progress post survives reloads (title/body via the local draft,
  // beneficiaries via the persisted advanced state), so "the ecency row was
  // already injected/removed for this post" must survive them too.
  const [supportEcencySettled, setSupportEcencySettled] = useLocalStorage(
    PREFIX + "_sa_seb",
    false
  );

  // Inject the stored "Support Ecency" beneficiary preference into new posts
  // only. username/permlink exist exclusively on the edit route and are known
  // synchronously, so the injection stays off during the whole async window
  // while useEntryDetector still resolves the edited entry (editingEntry is
  // null until then). Same dedup / Hive-limit / no-re-add rules as the publish
  // editor; flows into publish and scheduled posts alike.
  useSupportEcencyBeneficiaryInjection(beneficiaries, setBeneficiaries, {
    enabled: !username && !permlink && editingEntry === null,
    settled: supportEcencySettled ?? false,
    setSettled: setSupportEcencySettled
  });

  const setDescription = useCallback(
    (value: string) => {
      setAdvancedDescription(value.slice(0, SUBMIT_DESCRIPTION_MAX_LENGTH));
    },
    [setAdvancedDescription]
  );

  useCommunityDetector((community) => setTags((prev) => sanitizeTags([...prev, community])));

  useEntryDetector(username, permlink, (entry) => {
    if (entry) {
      applyTitle(entry.title);
      applyTags(Array.from(new Set(entry.json_metadata?.tags ?? [])));
      setBody(entry.body);
      setDescription(
        entry.json_metadata?.description ?? postBodySummary(body, SUBMIT_DESCRIPTION_MAX_LENGTH)
      );
      entry?.json_metadata?.image && setSelectedThumbnail(entry?.json_metadata?.image[0]);
      setEditingEntry(entry);
    } else if (editingEntry) {
      setEditingEntry(null);
    }
  });

  useApiDraftDetector(
    draftId,
    (draft) => {
      applyTitle(draft.title);
      applyTags(
        draft.tags
          .trim()
          .split(/[ ,]+/)
          .filter((t) => !!t)
      );
      setBody(draft.body);
      setEditingDraft(draft);
      setBeneficiaries(draft.meta?.beneficiaries ?? []);
      setReward(draft.meta?.rewardType ?? "default");
      setSelectedThumbnail(draft.meta?.image?.[0]);
      setDescription(draft.meta?.description ?? "");

      setTimeout(() => setIsDraftEmpty(false), 100);
    },
    () => {
      clear();
      router.replace("/submit");
    }
  );

  useEffect(() => {
    if (postPoll) {
      setActivePoll(postPoll);
    }
  }, [postPoll]);

  useEffect(() => {
    if (postBodyRef.current) {
      postBodyRef.current.addEventListener("paste", (event) =>
        toolbarEventListener(event, "paste")
      );
      postBodyRef.current.addEventListener("dragover", (event) =>
        toolbarEventListener(event, "dragover")
      );
      postBodyRef.current.addEventListener("drop", (event) => toolbarEventListener(event, "drop"));
    }
  }, [postBodyRef]);

  useEffect(() => {
    if (activeUser?.username !== previousActiveUser?.username && activeUser && previousActiveUser) {
      // delete active user from beneficiaries list
      setBeneficiaries(beneficiaries.filter((x) => x.account !== activeUser.username));
    }
  }, [activeUser, beneficiaries, previousActiveUser, setBeneficiaries]);

  // In case of creating new post then should save to local draft
  useEffect(() => {
    if (editingEntry === null) {
      setLocalDraft({ tags, title, body, description });
    }
  }, [tags, title, body, setLocalDraft, description, editingEntry]);

  useEffect(() => {
    if (_updateTimer) {
      clearTimeout(_updateTimer);
      _updateTimer = null;
    }

    // Not sure why we are using setTimeOut(), but it causes some odd behavior and sets input value to preview.body when you try to delete/cancel text
    _updateTimer = setTimeout(() => {
      setPreview({ title, tags, body, description });
    }, 50);
  }, [title, body, tags]);

  useEffect(() => {
    // Whenever body changed then need to re-validate thumbnails
    const { thumbnails: extracted } = extractMetaData(body, editingEntry?.json_metadata ?? {});

    // Drop the thumbnail of any video that is no longer embedded in the body
    const activeVideoThumbnails = videoThumbnails
      .filter(({ embedUrl }) => body.includes(embedUrl))
      .map(({ thumbUrl }) => thumbUrl);

    // A restored draft loses the in-memory list above, and its video thumbnail cannot be
    // recovered by parsing the body, so bring it back from the saved metadata for as long
    // as the video it belongs to is still embedded.
    const restoredVideoThumbnails = hasThreeSpeakEmbed(body) ? (editingDraft?.meta?.image ?? []) : [];

    const mergedThumbnails = Array.from(
      new Set([...(extracted ?? []), ...activeVideoThumbnails, ...restoredVideoThumbnails])
    );
    setThumbnails(mergedThumbnails);

    // In case of thumbnail isn't part of the thumbnails then should be reset to first one
    if (!selectedThumbnail || !mergedThumbnails.includes(selectedThumbnail)) {
      setSelectedThumbnail(mergedThumbnails[0]);
    }

    setIsDraftEmpty(!Boolean(title?.length || tags?.length || body?.length));
  }, [body, selectedThumbnail, videoThumbnails, editingDraft]);

  useEffect(() => {
    if (searchParams && typeof searchParams?.cat === "string" && searchParams.cat.length > 0) {
      setTags((value) => sanitizeTags(Array.from(new Set(value).add(searchParams.cat!))));
    }
  }, [searchParams, sanitizeTags]);

  const clear = () => {
    setTitle("");
    setTags([]);
    setBody("");

    // clear advanced
    setAdvanced(false);
    setReward("default");
    setBeneficiaries([]);
    setSchedule(null);
    setReblogSwitch(false);
    setIsDraftEmpty(true);
    setDescription("");

    clearAdvanced();
    // The next post is a fresh session for the Support Ecency injection.
    setSupportEcencySettled(false);
    setSelectedThumbnail(undefined);
    setThumbnails([]);
    setVideoThumbnails([]);
    clearActivePoll();
  };

  const tagsChanged = (nextTags: string[]): void => {
    const sanitizedTags = sanitizeTags(nextTags);

    if (isEqual(tags, sanitizedTags)) {
      // tag selector calls onchange event 2 times on each change.
      // one for add event one for sort event.
      // important to check if tags really changed.
      return;
    }

    setTags(sanitizedTags);

    // Toggle off reblog switch if it is true and the first tag is not community tag.
    if (reblogSwitch) {
      const isCommunityTag = sanitizedTags?.length > 0 && isCommunity(sanitizedTags[0]);

      if (!isCommunityTag) {
        setReblogSwitch(false);
      }
    }
  };

  const focusInput = (parentSelector: string): void => {
    const el = document.querySelector(`${parentSelector} .form-control`) as HTMLInputElement;
    if (el) {
      el.focus();
    }
  };

  const validate = () => {
    if (title.trim() === "") {
      focusInput(".title-input");
      error(i18next.t("submit.empty-title-alert"));
      return false;
    }

    if (tags?.length === 0) {
      focusInput(".tag-input");
      error(i18next.t("submit.empty-tags-alert"));
      return false;
    }

    if (body.trim() === "") {
      focusInput(".body-input");
      error(i18next.t("submit.empty-body-alert"));
      return false;
    }

    if (tags.length > 10) {
      error(i18next.t("tag-selector.error-max", { n: 10 }));
      return false;
    }

    return true;
  };

  return (
    <>
      <FullHeight />
      <Theme />
      <Feedback />
      <Navbar />

      <div className="app-content submit-page">
        <div className="editor-panel">
          {editingEntry === null && activeUser && (
            <div className="community-input whitespace-nowrap">
              <CommunitySelector
                tags={tags}
                onSelect={(prev, next) => {
                  const newTags = [...[next ? next : ""], ...tags.filter((x) => x !== prev)].filter(
                    (x) => x
                  );

                  tagsChanged(newTags);
                }}
              />
            </div>
          )}
          <EditorToolbar
            comment={false}
            existingPoll={activePoll}
            onVideoUploaded={
              editingEntry || hasThreeSpeakEmbed(body)
                ? undefined
                : (embedUrl, thumbnailUrl) => {
                    setBody(`${body}\n${embedUrl}`);
                    if (thumbnailUrl) {
                      setVideoThumbnails((prev) =>
                        prev.some((v) => v.embedUrl === embedUrl)
                          ? prev
                          : [...prev, { embedUrl, thumbUrl: thumbnailUrl }]
                      );
                    }
                  }
            }
            onAddPoll={(v) => setActivePoll(v)}
            onDeletePoll={() => clearActivePoll()}
            readonlyPoll={!!editingEntry}
          />
          <div className="title-input">
            <FormControl
              id="submit-title"
              noStyles={true}
              type="text"
              className="accepts-emoji form-control px-3 py-1 w-full outline-none shadow-0"
              placeholder={i18next.t("submit.title-placeholder")}
              autoFocus={true}
              value={title}
              dir={"auto"}
              onChange={(e) => applyTitle(e.target.value)}
              spellCheck={true}
            />
          </div>
          <div className="tag-input">
            <TagSelector
              tags={tags}
              maxItem={10}
              onChange={tagsChanged}
              onValid={(v) => setDisabled(v)}
            />
          </div>
          <div className="body-input" role="presentation" onKeyDown={handleShortcuts} ref={postBodyRef}>
            <TextareaAutocomplete
              acceptCharset="UTF-8"
              id="the-editor"
              className="the-editor accepts-emoji form-control"
              as="textarea"
              placeholder={i18next.t("submit.body-placeholder")}
              value={body}
              onChange={(e: { target: { value: string } }) => {
                setBody(e.target.value);
              }}
              disableRows={true}
              maxrows={100}
              dir={"auto"}
              spellCheck={true}
            />
          </div>
          {activeUser ? (
            <AvailableCredits
              className="mr-2"
              operation="comment_operation"
              username={activeUser.username}
            />
          ) : (
            <></>
          )}
          <EditorPanelActions
            onClear={clear}
            advanced={advanced}
            getHasAdvanced={getHasAdvanced}
            setAdvanced={setAdvanced}
            editingEntry={editingEntry}
            editingDraft={editingDraft}
          />
        </div>
        <div className="flex-spacer" />
        {advanced && (
          <div className="advanced-panel">
            <div className="panel-header">
              <h2 className="panel-header-title">{i18next.t("submit.advanced")}</h2>
            </div>
            <div className="panel-body">
              <div className="container px-3">
                {editingEntry === null && (
                  <>
                    <div className="grid grid-cols-12 mb-4">
                      <div className="col-span-12 sm:col-span-3">
                        <label>{i18next.t("submit.reward")}</label>
                      </div>
                      <div className="col-span-12 sm:col-span-9">
                        <FormControl
                          type="select"
                          value={reward}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            setReward(e.target.value as RewardType);
                          }}
                        >
                          <option value="default">{i18next.t("submit.reward-default")}</option>
                          <option value="sp">{i18next.t("submit.reward-sp")}</option>
                          <option value="dp">{i18next.t("submit.reward-dp")}</option>
                        </FormControl>
                        <small className="text-gray-600 dark:text-gray-400">
                          {i18next.t("submit.reward-hint")}
                        </small>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 mb-4">
                      <div className="col-span-12 sm:col-span-3">
                        <label>{i18next.t("submit.beneficiaries")}</label>
                      </div>
                      <div className="col-span-12 sm:col-span-9">
                        <BeneficiaryEditorDialog
                          author={activeUser?.username}
                          list={beneficiaries}
                          lockedAccounts={hasThreeSpeakEmbed(body) ? ["threespeakfund"] : []}
                          onAdd={(item) => {
                            const b = [...beneficiaries, item].sort((a, b) =>
                              a.account < b.account ? -1 : 1
                            );
                            setBeneficiaries(b);
                          }}
                          onDelete={(username) => {
                            const b = [
                              ...beneficiaries.filter(
                                (x: { account: string }) => x.account !== username
                              )
                            ];
                            setBeneficiaries(b);
                          }}
                        />
                        <small className="text-gray-600 dark:text-gray-400">
                          {i18next.t("submit.beneficiaries-hint")}
                        </small>
                      </div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-12 mb-4">
                  <div className="col-span-12 sm:col-span-3">
                    <label>{i18next.t("submit.description")}</label>
                  </div>
                  <div className="col-span-12 sm:col-span-9">
                    <FormControl
                      type="textarea"
                      value={description ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                        setDescription(e.target.value);
                      }}
                      rows={3}
                      maxLength={SUBMIT_DESCRIPTION_MAX_LENGTH}
                    />
                    <small className="text-gray-600 dark:text-gray-400">
                      {description !== ""
                        ? description
                        : postBodySummary(body, SUBMIT_DESCRIPTION_MAX_LENGTH)}
                    </small>
                  </div>
                </div>
                {editingEntry === null && (
                  <EcencyConfigManager.Conditional
                    condition={({ visionFeatures }) => visionFeatures.schedules.enabled}
                  >
                    <div className="grid grid-cols-12 mb-4">
                      <div className="col-span-12 sm:col-span-3">
                        <label>{i18next.t("submit.schedule")}</label>
                      </div>
                      <div className="col-span-12 sm:col-span-9">
                        <PostSchedulerDialog
                          date={schedule ? dayjs(schedule) : null}
                          onChange={(d) => {
                            setSchedule(d ? d.toISOString() : null);
                          }}
                        />
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {i18next.t("submit.schedule-hint")}
                        </div>
                      </div>
                    </div>
                  </EcencyConfigManager.Conditional>
                )}
                {editingEntry === null && tags?.length > 0 && isCommunity(tags[0]) && (
                  <div className="grid grid-cols-12 mb-4">
                    <div className="col-span-12 sm:col-span-3" />
                    <div className="col-span-12 sm:col-span-9">
                      <FormControl
                        type="checkbox"
                        isToggle={true}
                        id="reblog-switch"
                        label={i18next.t("submit.reblog")}
                        checked={reblogSwitch}
                        onChange={(v) => {
                          setReblogSwitch(v);
                        }}
                      />
                      <small className="text-gray-600 dark:text-gray-400">
                        {i18next.t("submit.reblog-hint")}
                      </small>
                    </div>
                  </div>
                )}
                {thumbnails?.length > 0 && (
                  <div className="grid grid-cols-12 mb-4">
                    <div className="col-span-12 sm:col-span-3">
                      <label>{i18next.t("submit.thumbnail")}</label>
                    </div>
                    <div className="col-span-12 sm:col-span-9 flex flex-wrap selection-container">
                      {Array.from(new Set(thumbnails)).map((item, i) => {
                        let selectedItem = selectedThumbnail;
                        switch (selectedItem) {
                          case "":
                            selectedItem = thumbnails[0];
                            break;
                        }
                        if (!thumbnails.includes(selectedThumbnail ?? "")) {
                          selectedItem = thumbnails[0];
                        }
                        return (
                          <div className="relative" key={item + i}>
                            <div
                              className={`selection-item shadow ${
                                selectedItem === item ? "selected" : ""
                              } mr-3 mb-2`}
                              style={{
                                backgroundImage: `url("${proxifyImageSrc(item, 260, 200)}")`
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={i18next.t("publish.thumb-selection", { defaultValue: "Select thumbnail" })}
                              aria-pressed={selectedItem === item}
                              onClick={() => setSelectedThumbnail(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedThumbnail(item);
                                }
                              }}
                              key={item}
                            />
                            {selectedItem === item && (
                              <div className="text-green check absolute bg-white rounded-full p-1 flex justify-center items-center [&>svg]:size-6">
                                {checkSvg}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <EditorActions
              isDraftEmpty={isDraftEmpty}
              drafts={drafts}
              setDrafts={setDrafts}
              onClear={clear}
              editingDraft={editingDraft}
              editingEntry={editingEntry}
              schedule={schedule}
              title={title}
              tags={tags}
              body={body}
              reward={reward}
              reblogSwitch={reblogSwitch}
              beneficiaries={beneficiaries}
              description={description}
              selectedThumbnail={selectedThumbnail}
              validate={validate}
              onDraftCreated={(draft) => setEditingDraft(draft)}
            />
          </div>
        )}
        {!advanced && (
          <div className="preview-panel">
            <div className="panel-header">
              <h2 className="panel-header-title">{i18next.t("submit.preview")}</h2>
              <WordCount selector=".preview-body" watch={true} />
            </div>
            <SubmitPreviewContent title={preview.title} body={preview.body} tags={preview.tags} />
            <EditorActions
              isDraftEmpty={isDraftEmpty}
              drafts={drafts}
              setDrafts={setDrafts}
              onClear={clear}
              editingDraft={editingDraft}
              editingEntry={editingEntry}
              schedule={schedule}
              title={title}
              tags={tags}
              body={body}
              reward={reward}
              reblogSwitch={reblogSwitch}
              beneficiaries={beneficiaries}
              description={description}
              selectedThumbnail={selectedThumbnail}
              validate={validate}
              onDraftCreated={(draft) => setEditingDraft(draft)}
            />
          </div>
        )}
      </div>
    </>
  );
}

export const SubmitWithProvidersPage = (props: Props) => {
  return (
    <BodyVersioningManager>
      <PollsManager>
        <Submit {...props} />
      </PollsManager>
    </BodyVersioningManager>
  );
};
