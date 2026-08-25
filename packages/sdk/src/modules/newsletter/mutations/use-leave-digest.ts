import { QueryKeys } from "@/modules/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveDigestRequest } from "../api";
import type { DigestSubscription } from "../types";

/** Leave one digest by subscription id; drops the row from the cached list. */
export function useLeaveDigest(
  username: string | undefined,
  code: string | undefined,
) {
  const queryClient = useQueryClient();
  const name = username?.replace("@", "");

  return useMutation({
    mutationKey: ["newsletter", "leave", name],
    mutationFn: async (id: string) => {
      if (!name || !code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return leaveDigestRequest(id, code);
    },
    onSuccess(_result, id) {
      queryClient.setQueryData<DigestSubscription[]>(
        QueryKeys.newsletter.subscriptions(name),
        (prev) => (prev ?? []).filter((s) => s.id !== id),
      );
    },
  });
}
