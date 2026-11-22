import { useMutation } from "@tanstack/react-query";
import { Entry, WaveEntry } from "@/entities";
import { DecentMemesPayload } from "@/api/decentmemes";
import { error, success } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { reportRcRejection } from "@/api/rc-shortfall-report";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { useWavesApi } from "./use-waves-api";
import i18next from "i18next";

export function useWaveCreateReply() {
  const { mutateAsync: generalApiRequest } = useWavesApi();
  const username = useActiveUsername();

  return useMutation({
    mutationKey: ["wave-create-reply"],
    mutationFn: async ({
      editingEntry,
      parent,
      raw,
      videoThumbnail,
      decentMemes
    }: {
      parent: Entry;
      raw: string;
      editingEntry?: WaveEntry;
      videoThumbnail?: string;
      decentMemes?: DecentMemesPayload;
    }) =>
      generalApiRequest({
        entry: parent,
        raw,
        editingEntry,
        videoThumbnail,
        decentMemes,
        isReply: true
      }),
    onSuccess: () => success(i18next.t("waves.success-reply")),
    onError: (e) => {
      reportRcRejection(e, "comment", username);
      error(...formatError(e));
    }
  });
}
