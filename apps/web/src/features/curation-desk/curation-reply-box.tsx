"use client";

import React, { useState } from "react";
import i18next from "i18next";
import { useCreateReply } from "@/api/mutations";
import { createReplyPermlink, makeJsonMetaDataReply } from "@/utils";
import * as ls from "@/utils/local-storage";
import { Comment, type CommentSubmitOptions, type FailedReply } from "@/features/shared/comment";
import { rememberFailedDecline } from "@/features/shared/comment/failed-decline";
import type { Entry } from "@/entities";
import appPackage from "../../../package.json";

interface Props {
  entry: Entry;
  open: boolean;
  onClose: () => void;
}

/**
 * The reply box of the quick view. The same optimistic reply the post page
 * makes: the mutation answers at once and settles in the background, so the
 * box closes on submit. A broadcast that fails later reopens it with the text
 * kept, which is why the box stays mounted while it is closed; and the text
 * also goes back into the editor's own draft, so a failure that lands after
 * the curator moved to another post is waiting when they come back, with the
 * payout choice it was sent with.
 */
export function CurationReplyBox({ entry, open, onClose }: Props) {
  const [failedReply, setFailedReply] = useState<FailedReply | null>(null);

  const { mutateAsync: createReply, isPending } = useCreateReply(
    entry,
    entry,
    onClose,
    (text, _err, submitted) => {
      ls.set(`reply_text_${entry.author}_${entry.permlink}`, text);
      // Its payout choice goes with it, for the account that sent it, so the
      // kept text comes back declined as it was sent, whoever is active now.
      rememberFailedDecline(submitted.username, entry.author, entry.permlink, text, submitted.declinePayout);
      setFailedReply({ text, ...submitted });
    }
  );

  const submit = async (text: string, { declinePayout }: CommentSubmitOptions) => {
    const permlink = createReplyPermlink(entry.author);
    const tags = entry.json_metadata?.tags || ["ecency"];
    const jsonMeta = makeJsonMetaDataReply(tags, appPackage.version);
    setFailedReply(null);
    return createReply({ jsonMeta, text, permlink, point: true, declinePayout });
  };

  if (!open && failedReply == null) return null;

  return (
    <div className="mt-3" data-curation-reply>
      <Comment
        submitText={i18next.t("g.reply")}
        entry={entry}
        onSubmit={submit}
        onCancel={() => {
          setFailedReply(null);
          onClose();
        }}
        cancellable
        autoFocus
        inProgress={isPending}
        failedReply={failedReply}
      />
    </div>
  );
}
