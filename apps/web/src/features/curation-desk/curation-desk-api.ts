import { ensureValidToken } from "@/utils";
import {
  curationApplicationApplyRequest,
  curationApplicationDecideRequest,
  curationApplicationVoteRequest,
  curationApplicationListRequest,
  curationApplicationMineRequest,
  curationApplicationWindowRequest,
  curationApplicationWithdrawRequest,
  curationDismissRecoRequest,
  curationMarkClearRequest,
  curationMarkRequest,
  curationMyMarksRequest,
  curationRecommendMetaRequest,
  curationRosterFeedRequest,
  curationRosterListRequest,
  curationRosterRetireRequest,
  curationRosterSetRequest,
  curationTickRequest,
  type CurationApplicationAnswers,
  type CurationApplicationDecideInput,
  type CurationApplicationState,
  type CurationApplicationVoteInput,
  type CurationDismissRecoInput,
  type CurationMarkInput,
  type CurationMyMarksParams,
  type CurationRecommendMetaInput,
  type CurationRosterFeedParams,
  type CurationRosterSetInput,
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


  async recommendMeta(
    username: string | undefined,
    input: Omit<CurationRecommendMetaInput, "ua_class"> & { ua_class?: "web" }
  ) {
    return curationRecommendMetaRequest(await code(username), { ...input, ua_class: "web" });
  },

  async dismissReco(username: string | undefined, input: CurationDismissRecoInput) {
    return curationDismissRecoRequest(await code(username), input);
  },

  async rosterList(username: string | undefined, signal?: AbortSignal) {
    return curationRosterListRequest(await code(username), signal);
  },

  async rosterSet(username: string | undefined, input: CurationRosterSetInput) {
    return curationRosterSetRequest(await code(username), input);
  },

  async rosterRetire(username: string | undefined, curator: string) {
    return curationRosterRetireRequest(await code(username), curator);
  },

  async applicationApply(username: string | undefined, answers: CurationApplicationAnswers) {
    return curationApplicationApplyRequest(await code(username), answers);
  },

  async applicationMine(username: string | undefined, signal?: AbortSignal) {
    return curationApplicationMineRequest(await code(username), signal);
  },

  async applicationWithdraw(username: string | undefined) {
    return curationApplicationWithdrawRequest(await code(username));
  },

  async applicationList(
    username: string | undefined,
    state?: CurationApplicationState,
    signal?: AbortSignal
  ) {
    return curationApplicationListRequest(await code(username), { state }, signal);
  },

  async applicationDecide(username: string | undefined, input: CurationApplicationDecideInput) {
    return curationApplicationDecideRequest(await code(username), input);
  },

  async applicationVote(username: string | undefined, input: CurationApplicationVoteInput) {
    return curationApplicationVoteRequest(await code(username), input);
  },

  async applicationWindow(
    username: string | undefined,
    input: { open?: boolean; message?: string | null; quorum?: number; term_days?: number }
  ) {
    return curationApplicationWindowRequest(await code(username), input);
  },
};
