"use client";

import { useCreateReply, usePinReply, useUpdateReply } from "@/api/mutations";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { Community, Entry } from "@/entities";
import { SortOrder } from "@/enums";
import {
  EcencySourceBadge,
  EntryDeleteBtn,
  EntryPayout,
  EntryTipBtn,
  EntryVoteBtn,
  EntryVotes,
  ProfileLink,
  ProfilePopover,
  UserAvatar
} from "@/features/shared";
import { MuteBtn } from "@/features/shared/mute-btn";
import {
  createReplyPermlink,
  dateToFormatted,
  dateToFullRelative,
  makeJsonMetaDataReply
} from "@/utils";
import {
  getCommunityContextQueryOptions,
  getCommunityPermissions,
  getCommunityType,
  isHiddenPost
} from "@ecency/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/button";
import { Dropdown, DropdownItemWithIcon, DropdownMenu, DropdownToggle } from "@ui/dropdown";
import { alertCircleSvg, deleteForeverSvg, dotsHorizontal, pencilOutlineSvg, pinSvg } from "@ui/svg";
import { StyledTooltip } from "@ui/tooltip";
import i18next from "i18next";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import appPackage from "../../../../package.json";
import dynamic from "next/dynamic";
import { Tsx } from "../../i18n/helper";
import { EntryLink } from "../entry-link";
import { DiscussionBots } from "./discussion-bots";
import { DiscussionItemBody } from "./discussion-item-body";
import { DiscussionList } from "./discussion-list";

// The reply/edit composer (markdown editor toolbar, emoji/GIF pickers, textarea
// autocomplete, polls/video upload) only renders behind the reply/edit toggles
// below. Load it lazily so the SSR'd comment list doesn't pull the whole
// composer into the post page's first-load bundle.
const Comment = dynamic(() => import("../comment").then((m) => ({ default: m.Comment })), {
  ssr: false
});

interface Props {
  entry: Entry;
  root: Entry;
  community: Community | null;
  isRawContent: boolean;
  hideControls: boolean;
  discussionList: Entry[];
  botsList: string[];
  mutedUsers: string[];
  canMute: boolean;
}

export const DiscussionItem = memo(function DiscussionItem({
  hideControls,
  isRawContent,
  entry,
  community,
  discussionList,
  root,
  botsList,
  mutedUsers,
  canMute
}: Props) {
  const { activeUser } = useActiveAccount();
  const [reply, setReply] = useState(false);
  const [edit, setEdit] = useState(false);
  const [failedReplyText, setFailedReplyText] = useState<string | null>(null);
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();

  const isCommunityPost = !!community?.name;
  const { data: userContext } = useQuery({
    ...getCommunityContextQueryOptions(activeUser?.username, community?.name ?? undefined),
    enabled: isCommunityPost && !!activeUser?.username,
    select: ({ subscribed, role }) =>
      getCommunityPermissions({
        communityType: getCommunityType(community?.name ?? "", -1),
        subscribed,
        userRole: role
      })
  });

  const canComment = isCommunityPost
      ? userContext?.canComment
      : !!activeUser?.username;

  const readMore = useMemo(() => entry.children > 0 && entry.depth > 5, [entry]);
  const showSubList = useMemo(() => !readMore && entry.children > 0, [entry, readMore]);
  const canEdit = useMemo(() => activeUser?.username === entry.author, [activeUser, entry]);
  const anchorId = useMemo(() => `anchor-@${entry.author}/${entry.permlink}`, [entry]);
  const isPinned = useMemo(
    () => root.json_metadata?.pinned_reply === `${entry.author}/${entry.permlink}`,
    [root, entry]
  );
  const selected = useMemo(
    () => typeof window !== "undefined" && window.location.hash === `#@${entry.author}/${entry.permlink}`,
    [entry]
  );

  const entryIsMuted = useMemo(() => mutedUsers?.includes(entry.author), [entry, mutedUsers]);
  const isTopComment = useMemo(
    () => entry.parent_author === root.author && entry.parent_permlink === root.permlink,
    [entry, root]
  );
  const isComment = !!entry.parent_author;
  const isOwnRoot = useMemo(() => activeUser?.username === root.author, [activeUser, root]);
  const isOwnReply = useMemo(() => activeUser?.username === entry.author, [activeUser, entry]);
  const isHidden = useMemo(
    () => isHiddenPost(entry.net_rshares, entry.stats?.total_votes ?? entry.active_votes?.length ?? 0),
    [entry.net_rshares, entry.stats?.total_votes, entry.active_votes?.length]
  );
  const isMuted = useMemo(
    () => entry.stats?.gray === true && entry.net_rshares >= 0 && entry.author_reputation >= 0,
    [entry]
  );
  const isLowReputation = useMemo(
    () => entry.stats?.gray === true && entry.net_rshares >= 0 && entry.author_reputation < 0,
    [entry]
  );
  const mightContainMutedComments = useMemo(
    () => activeUser && entryIsMuted && !isComment && !isOwnReply,
    [activeUser, entryIsMuted, isComment, isOwnReply]
  );
  const shouldCollapseContent = useMemo(
    () => isMuted || isLowReputation || mightContainMutedComments,
    [isLowReputation, isMuted, mightContainMutedComments]
  );
  const [isContentCollapsed, setIsContentCollapsed] = useState(shouldCollapseContent);
  useEffect(() => {
    setIsContentCollapsed(shouldCollapseContent);
  }, [entry.author, entry.permlink, entry.post_id, shouldCollapseContent]);
  const warningMessages: Array<{ key: string; content: ReactNode }> = [];
  if (isMuted) {
    warningMessages.push({
      key: "muted",
      content: (
        <Tsx k="entry.muted-warning" args={{ community: entry.community_title }}>
          <span />
        </Tsx>
      )
    });
  }
  if (isLowReputation) {
    warningMessages.push({
      key: "low-reputation",
      content: <span>{i18next.t("entry.lowrep-warning")}</span>
    });
  }
  if (mightContainMutedComments) {
    warningMessages.push({
      key: "muted-comments",
      content: <span>{i18next.t("entry.comments-hidden")}</span>
    });
  }
  const toggleLabelKey = isMuted || mightContainMutedComments ? "discussion.reveal-muted" : "discussion.reveal";
  const isDeletable = useMemo(
    () =>
      !(entry.is_paidout || entry.net_rshares > 0 || entry.children > 0) &&
      entry.author === activeUser?.username,
    [entry, activeUser]
  );

  const hasAnyAction = useMemo(
    () => canEdit || (isOwnRoot && isTopComment) || isDeletable,
    [canEdit, isOwnRoot, isTopComment, isDeletable]
  );

  const queryClient = useQueryClient();

  const allReplies = queryClient.getQueryData<Entry[]>([
    "posts",
    "discussions",
    root.author,
    root.permlink,
    SortOrder.created,
    activeUser?.username ?? root.author
  ]);

  const filtered = useMemo(
    () =>
      (allReplies ?? []).filter(
        (x) => x.parent_author === entry.author && x.parent_permlink === entry.permlink
      ),
    [allReplies, entry]
  );

  const botsData = useMemo(
    () => filtered.filter((e) => botsList.includes(e.author) && e.children === 0),
    [filtered, botsList]
  );

  const { mutateAsync: createReply, isPending: isCreateLoading } = useCreateReply(
    entry,
    root,
    async () => {
      // Only close and clear on successful blockchain confirmation
      setReply(false);
      setFailedReplyText(null);
      return;
    },
    (text, error) => {
      // Blockchain failed - restore text and keep form open
      setFailedReplyText(text);
      setReply(true); // Ensure form stays open
    }
  );
  const { mutateAsync: updateReply, isPending: isUpdateReplyLoading } = useUpdateReply(
    entry,
    async () => {
      toggleEdit();
      return;
    },
    undefined,
    root
  );
  const { mutateAsync: pinReply } = usePinReply(entry, root);

  const toggleReply = () => {
    if (edit) return;
    if (!reply) {
      // Opening reply form - clear failed text
      setFailedReplyText(null);
    }
    setReply((r) => !r);
  };
  const toggleEdit = () => reply || setEdit((e) => !e);

  const submitReply = async (text: string) => {
    const permlink = createReplyPermlink(entry.author);
    await createReply({
      text,
      jsonMeta: makeJsonMetaDataReply(entry.json_metadata?.tags || ["ecency"], appPackage.version),
      permlink,
      point: true
    });
    // Don't close form here - let the mutation's onSuccess/onError handle it
  };

  const _updateReply = (text: string) =>
    updateReply({
      text,
      point: true,
      jsonMeta: makeJsonMetaDataReply(entry.json_metadata?.tags || ["ecency"], appPackage.version)
    });

  return (
    <div className={`discussion-item depth-${entry.depth} ${selected ? "selected-item" : ""}`}>
      <div className="relative">
        <div className="item-anchor" id={anchorId} />
      </div>
      <div className="item-inner">
        <div className="item-figure">
          <ProfileLink username={entry.author}>
            <UserAvatar username={entry.author} size="medium" />
          </ProfileLink>
        </div>
        <div className="item-content">
          <div className="item-header">
            <div className="flex items-center" id={`${entry.author}-${entry.permlink}`}>
              <ProfilePopover entry={entry} />
            </div>
            <span className="separator circle-separator" />
            <div className="flex items-center">
              <EntryLink entry={entry}>
                <span className="date" title={dateToFormatted(entry.created)}>
                  {dateToFullRelative(entry.created)}
                </span>
              </EntryLink>
              {isPinned && <div className="size-3.5 ml-3 flex">{pinSvg}</div>}
              {isHidden && (
                <StyledTooltip content={i18next.t("entry.hidden-warning")}>
                  <span
                    className="size-3.5 ml-3 flex text-warning cursor-help"
                    role="img"
                    aria-label={i18next.t("entry.hidden-warning")}
                  >
                    {alertCircleSvg}
                  </span>
                </StyledTooltip>
              )}
              <EcencySourceBadge app={entry.json_metadata?.app} className="ml-3" />
            </div>
          </div>

          {warningMessages.map((warning, index) => (
            <div
              key={warning.key}
              className="hidden-warning mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1">{warning.content}</div>
              {index === 0 && shouldCollapseContent && (
                <Button
                  size="sm"
                  appearance="link"
                  className="ml-auto"
                  aria-expanded={!isContentCollapsed}
                  onClick={() => setIsContentCollapsed((value) => !value)}
                >
                  {i18next.t(isContentCollapsed ? toggleLabelKey : "chat.hide-message")}
                </Button>
              )}
            </div>
          ))}

          {!isContentCollapsed && <DiscussionItemBody entry={entry} isRawContent={isRawContent} />}

          {!hideControls && (
            <div className="item-controls flex items-center gap-2">
              <EntryVoteBtn entry={entry} isPostSlider={false} />
              <EntryPayout entry={entry} />
              <EntryVotes entry={entry} />
              <EntryTipBtn entry={entry} />
              {canComment && (
                <a
                  className={`reply-btn ${edit ? "disabled" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={toggleReply}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleReply();
                    }
                  }}
                >
                  {i18next.t("g.reply")}
                </a>
              )}
              {community && canMute && (
                <MuteBtn
                  entry={entry}
                  community={community}
                  onSuccess={(entry) => updateEntryQueryData([entry])}
                />
              )}
              {hasAnyAction && (
                <div className="ml-3 dropdown-container">
                  <Dropdown>
                    <DropdownToggle>
                      <Button icon={dotsHorizontal} appearance="gray-link" aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
                    </DropdownToggle>
                    <DropdownMenu>
                      {canEdit && (
                        <DropdownItemWithIcon
                          label={i18next.t("g.edit")}
                          icon={pencilOutlineSvg}
                          onClick={toggleEdit}
                        />
                      )}
                      {isOwnRoot && isTopComment && (
                        <DropdownItemWithIcon
                          label={i18next.t(isPinned ? "g.unpin" : "g.pin")}
                          icon={pinSvg}
                          onClick={() => pinReply({ pin: !isPinned })}
                        />
                      )}
                      {isDeletable && (
                        <DropdownItemWithIcon
                          label={
                            <EntryDeleteBtn parent={root} entry={entry}>
                              <div className="flex items-center gap-3">
                                {} {i18next.t("g.delete")}
                              </div>
                            </EntryDeleteBtn>
                          }
                          icon={deleteForeverSvg}
                        />
                      )}
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}
              <DiscussionBots entries={botsData} />
            </div>
          )}

          {readMore && (
            <div className="read-more">
              <EntryLink entry={entry}>{i18next.t("discussion.read-more")}</EntryLink>
            </div>
          )}
        </div>
      </div>

      {/* reply/edit start false and only flip on user action, so the entrance
          animation never fires on initial render. The wrapper also masks the
          dynamic-import seam while the lazy composer chunk loads. */}
      {reply && (
        <div className="animate-fade-in-up">
          <Comment
            entry={entry}
            submitText={i18next.t("g.reply")}
            cancellable
            onSubmit={submitReply}
            onCancel={toggleReply}
            inProgress={isCreateLoading || isUpdateReplyLoading}
            autoFocus
            initialText={failedReplyText}
          />
        </div>
      )}

      {edit && (
        <div className="animate-fade-in-up">
          <Comment
            entry={entry}
            isEdit
            submitText={i18next.t("g.update")}
            cancellable
            onSubmit={_updateReply}
            onCancel={toggleEdit}
            inProgress={isCreateLoading || isUpdateReplyLoading}
            autoFocus
          />
        </div>
      )}

      {showSubList && (
        <DiscussionList
          discussionList={discussionList}
          community={community}
          parent={entry}
          root={root}
          hideControls={hideControls}
          isRawContent={isRawContent}
        />
      )}
    </div>
  );
});
