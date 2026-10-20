"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useMutedAuthors } from "@/features/shared/entry-list-item/use-muted-authors";
import i18next from "i18next";
import { isAuthorMuted } from "@ecency/sdk";
import { Entry } from "@/entities";

interface Props {
  entry: Entry;
}

export function EntryPageMightContainsMutedCommentsWarning({ entry }: Props) {
  const { activeUser } = useActiveAccount();
  // The same cached mute list the lists filter by, which a mute toggle keeps
  // current, rather than a separate first-100 copy that went stale on unmute.
  const mutedAuthors = useMutedAuthors();

  const isOwnEntry = !!activeUser && activeUser.username === entry.author;
  const isComment = !!entry.author && !!entry.parent_author;

  const mightContainMutedComments =
    !!activeUser && isAuthorMuted(entry.author, mutedAuthors) && !isComment && !isOwnEntry;

  return mightContainMutedComments ? (
    <div className="hidden-warning">
      <span>{i18next.t("entry.comments-hidden")}</span>
    </div>
  ) : null;
}
