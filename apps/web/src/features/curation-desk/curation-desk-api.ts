import { ensureValidToken } from "@/utils";
import {
  curationCursorRequest,
  curationDismissRecoRequest,
  curationMarkClearRequest,
  curationMarkRequest,
  curationMyMarksRequest,
  curationRecommendMetaRequest,
  curationRosterFeedRequest,
  curationTickRequest,
  type CurationCursorInput,
  type CurationDismissRecoInput,
  type CurationMarkInput,
  type CurationMyMarksParams,
  type CurationRecommendMetaInput,
  type CurationRosterFeedParams,
  type CurationTickRequest,
} from "@ecency/sdk";

/**
 * Web wrapper over the SDK desk client. Identity for every authed call comes
 * from ensureValidToken(), which AWAITS a refresh when the stored token has
 * expired; getAccessToken() only starts one in the background and hands back
 * the expired token; the first mark after a long absence would then 401.
 * The SDK functions take the code as an argument, so no builder ever captures
 * one that can go stale.
 */
async function code(username: string | undefined): Promise<string | undefined> {
  if (!username) return undefined;
  return (await ensureValidToken(username)) ?? undefined;
}

export const curationDeskApi = {
  async rosterFeed(
    username: string | undefined,
    params: CurationRosterFeedParams,
    cursor?: string,
    signal?: AbortSignal
  ) {
    return curationRosterFeedRequest(await code(username), params, cursor, signal);
  },

  async tick(username: string | undefined, body: CurationTickRequest, signal?: AbortSignal) {
    return curationTickRequest(await code(username), body, signal);
  },

  async mark(username: string | undefined, input: CurationMarkInput) {
    return curationMarkRequest(await code(username), input);
  },

  async markClear(username: string | undefined, input: { author: string; permlink: string }) {
    return curationMarkClearRequest(await code(username), input);
  },

  async myMarks(
    username: string | undefined,
    params: CurationMyMarksParams = {},
    signal?: AbortSignal
  ) {
    return curationMyMarksRequest(await code(username), params, signal);
  },

  async cursor(username: string | undefined, input: CurationCursorInput) {
    return curationCursorRequest(await code(username), input);
  },

  async recommendMeta(
    username: string | undefined,
    input: Omit<CurationRecommendMetaInput, "ua_class"> & { ua_class?: "web" }
  ) {
    return curationRecommendMetaRequest(await code(username), { ...input, ua_class: "web" });
  },

  async dismissReco(username: string | undefined, input: CurationDismissRecoInput) {
    return curationDismissRecoRequest(await code(username), input);
  },
};
