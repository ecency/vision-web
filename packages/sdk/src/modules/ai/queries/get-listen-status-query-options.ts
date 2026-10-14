import { queryOptions } from "@tanstack/react-query";
import { CONFIG, getBoundFetch, QueryKeys } from "../../core";
import type { ListenStatus } from "../types";

// Generation runs in the background after an unlock; poll until it settles.
const POLL_STATUSES = new Set(["preparing", "analyzing"]);
export const LISTEN_STATUS_POLL_MS = 5000;

/**
 * Listen state of a post. Anonymous when `accessToken` is missing; with it, the
 * answer says whether this reader unlocked the post and carries signed track URLs.
 *
 * `updated` is the post's last edit time as the client sees it. It is only a hint
 * that lets an unlocked reader's view of an edited post queue new audio; it is not
 * part of the key.
 */
export function getListenStatusQueryOptions(
  author: string,
  permlink: string,
  username?: string,
  accessToken?: string,
  updated?: string
) {
  const reader = username && accessToken ? username : undefined;
  return queryOptions({
    queryKey: QueryKeys.ai.listenStatus(author, permlink, reader),
    queryFn: async (): Promise<ListenStatus> => {
      if (!author || !permlink) {
        throw new Error("[SDK][AI][Listen] – author and permlink are required");
      }
      const response = await getBoundFetch()(CONFIG.privateApiHost + "/private-api/listen-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(reader ? { code: accessToken } : {}),
          author,
          permlink,
          ...(updated ? { updated } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch listen status: ${response.status}`);
      }
      return (await response.json()) as ListenStatus;
    },
    enabled: !!author && !!permlink,
    refetchInterval: (query) =>
      POLL_STATUSES.has(query.state.data?.status ?? "") ? LISTEN_STATUS_POLL_MS : false,
  });
}
