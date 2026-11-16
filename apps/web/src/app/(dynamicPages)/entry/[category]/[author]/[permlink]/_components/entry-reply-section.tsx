"use client";

import { Comment, type CommentSubmitOptions, type FailedReply } from "@/features/shared/comment";
import i18next from "i18next";
import { Entry } from "@/entities";
import { createReplyPermlink, makeJsonMetaDataReply } from "@/utils";
import { useCreateReply } from "@/api/mutations";
import appPackage from "../../../../../../../../package.json";
import { useContext, useState } from "react";
import { EntryPageContext } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/context";

interface Props {
    entry: Entry;
}

export function EntryReplySection({ entry }: Props) {
    const { commentsInputRef, setSelection } = useContext(EntryPageContext);
    const [failedReply, setFailedReply] = useState<FailedReply | null>(null);

    const { mutateAsync: createReply, isPending } = useCreateReply(
        entry,
        entry,
        () => {
            // Success - clear selection and failed text
            setSelection("");
            setFailedReply(null);
        },
        (text, error, submitted) => {
            // Blockchain failed - restore text and payout choice
            setFailedReply({ text, ...submitted });
        }
    );

    const replySubmitted = async (text: string, { declinePayout }: CommentSubmitOptions) => {
        const permlink = createReplyPermlink(entry.author);
        const tags = entry.json_metadata?.tags || ["ecency"];

        const response = await createReply({
            jsonMeta: makeJsonMetaDataReply(tags, appPackage.version),
            text,
            permlink,
            point: true,
            declinePayout
        });

        // Don't clear selection here - let onSuccess callback handle it
        return response;
    };

    return (
        <Comment
            submitText={i18next.t("g.reply")}
            entry={entry}
            onSubmit={replySubmitted}
            inProgress={isPending}
            inputRef={commentsInputRef}
            failedReply={failedReply}
        />
    );
}
