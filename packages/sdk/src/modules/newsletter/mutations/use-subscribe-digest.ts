import { QueryKeys } from "@/modules/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { subscribeDigestRequest } from "../api";
import type { DigestSubscribeInput } from "../types";

/**
 * Subscribe to a digest (also re-used to change cadence: same list + address
 * with a new cadence updates the row). Works signed-in (code) and anonymous
 * (input.captchaToken); the signed-in path refreshes the account's
 * subscriptions list on success.
 */
export function useSubscribeDigest(
  username: string | undefined,
  code: string | undefined,
) {
  const queryClient = useQueryClient();
  const name = username?.replace("@", "");

  return useMutation({
    mutationKey: ["newsletter", "subscribe", name],
    mutationFn: (input: DigestSubscribeInput) =>
      subscribeDigestRequest(input, code),
    onSuccess() {
      if (name) {
        queryClient.invalidateQueries({
          queryKey: QueryKeys.newsletter.subscriptions(name),
        });
      }
    },
  });
}
