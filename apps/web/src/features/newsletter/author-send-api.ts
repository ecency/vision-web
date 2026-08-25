import { ensureValidToken } from "@/utils";
import {
  NewsletterSendRefusedError,
  getNewsletterIssuesRequest,
  getNewsletterPostsRequest,
  previewNewsletterSendRequest,
  sendNewsletterIssueRequest,
} from "@ecency/sdk";
import type {
  NewsletterCandidatePost,
  NewsletterComposeRequest,
  NewsletterPostRef,
  NewsletterSendPreview,
  NewsletterSendRef,
  NewsletterSendRequest,
  NewsletterSendResult,
  NewsletterSentIssue,
} from "@ecency/sdk";

/**
 * Author sends (vision-web#1532), now delegating to the SDK newsletter client
 * (shared with mobile), which owns the transport and throws
 * NewsletterSendRefusedError with the service's status and code so the dialog
 * can say exactly why. What stays here is sourcing a FRESH HiveSigner token
 * per call; the route decides who may send.
 */
export type PostRef = NewsletterPostRef;
export type SendRef = NewsletterSendRef;
export type ComposeRequest = NewsletterComposeRequest;
export type SendRequest = NewsletterSendRequest;
export type CandidatePost = NewsletterCandidatePost;
export type SendPreview = NewsletterSendPreview;
export type SendResult = NewsletterSendResult;
export type SentIssue = NewsletterSentIssue;
export { COMPOSE_MAX, COMPOSE_MIN, INTRO_MAX, SUBJECT_MAX } from "./compose-limits";
export { NewsletterSendRefusedError as SendRefusedError };

async function freshToken(username: string): Promise<string> {
  return (await ensureValidToken(username)) ?? "";
}

export const authorSendApi = {
  async preview(req: SendRequest, username: string): Promise<SendPreview> {
    return previewNewsletterSendRequest(req, await freshToken(username));
  },
  async send(req: SendRequest, username: string): Promise<SendResult> {
    return sendNewsletterIssueRequest(req, await freshToken(username));
  },
  async candidates(type: "creator" | "community", target: string, username: string, limit = 20): Promise<CandidatePost[]> {
    return getNewsletterPostsRequest(type, target, await freshToken(username), limit);
  },
  async issues(type: "creator" | "community", target: string, username: string): Promise<SentIssue[]> {
    return getNewsletterIssuesRequest(type, target, await freshToken(username));
  }
};
