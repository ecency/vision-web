import React, { useState } from "react";
import { Entry } from "@/entities";
import { useLocation } from "react-use";
import { useCreateReply } from "@/api/mutations";
import { createReplyPermlink, makeJsonMetaDataReply } from "@/utils";
import appPackage from "../../../../../../package.json";
import i18next from "i18next";
import { Comment, type CommentSubmitOptions, type FailedReply } from "@/features/shared/comment";
import { useActiveAccount } from "@/core/hooks";

interface Props {
  entry: Entry;
  onReplied: () => void;
}

export const DeckPostViewerCommentBox = ({ entry, onReplied }: Props) => {
  const { username, account } = useActiveAccount();
  const location = useLocation();

  const [isReplying, setIsReplying] = useState(false);
  const [failedReply, setFailedReply] = useState<FailedReply | null>(null);

  const { mutateAsync: createReply } = useCreateReply(
    entry,
    entry,
    () => {
      // Success
      onReplied();
      setIsReplying(false);
      setFailedReply(null);
    },
    (text, error, submitted) => {
      // Blockchain failed - restore text and payout choice, stop loading
      setFailedReply({ text, ...submitted });
      setIsReplying(false);
    }
  );

  const submitReply = async (text: string, { declinePayout }: CommentSubmitOptions) => {
    if (!username || !account) {
      return;
    }

    const permlink = createReplyPermlink(entry.author);
    const tags = entry.json_metadata?.tags || ["ecency"];

    const jsonMeta = makeJsonMetaDataReply(tags, appPackage.version);

    setIsReplying(true);

    return createReply({ jsonMeta, text, permlink, point: true, declinePayout });
  };
  return (
    <Comment
      submitText={i18next.t("g.reply")}
      entry={entry}
      onSubmit={submitReply}
      inProgress={isReplying}
      failedReply={failedReply}
    />
  );
};
