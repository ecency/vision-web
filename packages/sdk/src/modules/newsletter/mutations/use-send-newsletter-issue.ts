import { QueryKeys } from "@/modules/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  previewNewsletterSendRequest,
  sendNewsletterIssueRequest,
} from "../api";
import type { NewsletterSendRequest } from "../types";

/**
 * Preview the would-be issue. No cache side effects: a preview changes
 * nothing server-side.
 */
export function usePreviewNewsletterIssue(
  username: string | undefined,
  code: string | undefined,
) {
  const name = username?.replace("@", "");
  return useMutation({
    mutationKey: ["newsletter", "send-preview", name],
    mutationFn: async (request: NewsletterSendRequest) => {
      if (!name || !code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return previewNewsletterSendRequest(request, code);
    },
  });
}

/**
 * Send a post or composed digest to a list. Errors are
 * NewsletterSendRefusedError with the relay's routing `code`
 * (already_sent + taken periods, suspended, post_refused, ...). On success the
 * list's issues + sender standing refresh.
 */
export function useSendNewsletterIssue(
  username: string | undefined,
  code: string | undefined,
) {
  const queryClient = useQueryClient();
  const name = username?.replace("@", "");

  return useMutation({
    mutationKey: ["newsletter", "send", name],
    mutationFn: async (request: NewsletterSendRequest) => {
      if (!name || !code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return sendNewsletterIssueRequest(request, code);
    },
    onSuccess(_result, request) {
      queryClient.invalidateQueries({
        queryKey: QueryKeys.newsletter.issues(request.type, request.target, name),
      });
      queryClient.invalidateQueries({
        queryKey: QueryKeys.newsletter.sender(request.type, request.target, name),
      });
    },
  });
}
