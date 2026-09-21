import { useMutation } from "@tanstack/react-query";
import pack from "../../../package.json";
import { useUpdateReply } from "./update-reply";
import { makeApp } from "@/utils/posting";
import { Entry, MetaData } from "@/entities";

export function usePinReply(reply?: Entry, parent?: Entry) {
  const { mutateAsync: updateReply } = useUpdateReply(parent);

  return useMutation({
    mutationKey: ["reply-pin", reply, parent],
    mutationFn: async ({ pin }: { pin: boolean }) => {
      if (!reply || !parent) {
        throw new Error("No reply or parent provided");
      }

      // This re-broadcasts the PARENT POST, and a comment operation replaces its
      // json_metadata rather than merging into it. Building the metadata from
      // scratch here published `{tags, app, format, pinned_reply}` and dropped
      // everything else the post carried: its cover image, thumbnails, summary,
      // image ratios and any poll. Pinning a reply must change one field and
      // leave the rest of the post's metadata exactly as its author published it.
      const meta: MetaData = {
        ...parent.json_metadata,
        app: makeApp(pack.version),
        format: "markdown+html",
        pinned_reply: pin ? `${reply.author}/${reply.permlink}` : undefined
      };
      // The title goes with it for the same reason the metadata does: the operation
      // replaces it, and the default for this path is a comment's empty title.
      return updateReply({ text: parent.body, point: true, jsonMeta: meta, title: parent.title });
    }
  });
}
