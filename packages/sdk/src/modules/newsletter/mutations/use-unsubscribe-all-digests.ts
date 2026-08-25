import { QueryKeys } from "@/modules/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unsubscribeAllDigestsRequest } from "../api";
import type { DigestSubscription } from "../types";

/**
 * Stop all Ecency mail to ONE address. Only that address's rows leave the
 * cached list: an account can hold subscriptions under more than one address,
 * and those stay visible.
 */
export function useUnsubscribeAllDigests(
  username: string | undefined,
  code: string | undefined,
) {
  const queryClient = useQueryClient();
  const name = username?.replace("@", "");

  return useMutation({
    mutationKey: ["newsletter", "unsubscribe-all", name],
    mutationFn: async (email: string) => {
      if (!name || !code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return unsubscribeAllDigestsRequest(email, code);
    },
    onSuccess(_result, email) {
      queryClient.setQueryData<DigestSubscription[]>(
        QueryKeys.newsletter.subscriptions(name),
        (prev) =>
          (prev ?? []).filter(
            (s) => s.email.toLowerCase() !== email.toLowerCase(),
          ),
      );
    },
  });
}
