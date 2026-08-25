import { CONFIG, getBoundFetch } from "@/modules/core";
import { NewsletterApiError, NewsletterSendRefusedError } from "./errors";
import type {
  DigestSubscribeInput,
  DigestSubscribeResult,
  DigestSubscription,
  NewsletterCandidatePost,
  NewsletterListType,
  NewsletterSendPreview,
  NewsletterSendRequest,
  NewsletterSendResult,
  NewsletterSenderStanding,
  NewsletterSentIssue,
} from "./types";

/**
 * Client for the newsletter relay at {privateApiHost}/api/newsletter/*
 * (Next.js route handlers on ecency.com, which alone hold the news-service
 * credentials — clients never talk to the service directly).
 *
 * Identity is the HiveSigner access token, passed here as the explicit `code`
 * argument. Transport mirrors the deployed web client per route: subscribe and
 * unsubscribe-all carry it in the POST body as `code` (the subscribe route
 * authenticates ONLY from the body — a header alone is treated as anonymous);
 * every other call, the send/preview POSTs included, uses the `X-HS-Token`
 * header. The relay verifies it upstream and derives the account from it, so
 * a stale token 401s — callers are responsible for supplying a fresh one
 * (web: ensureValidToken; mobile: the token-refresh wrapper).
 *
 * The email-token confirm/unsubscribe flows are deliberately absent: those
 * links land on web pages.
 */
function newsletterUrl(path: string): string {
  // The relay lives on the WEB origin; newsletterHost overrides where that is
  // ("" = same-origin, the web client's case). Nullish on purpose: only an
  // unset override falls back, an empty string is a meaningful host.
  return `${CONFIG.newsletterHost ?? CONFIG.privateApiHost}/api/newsletter${path}`;
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => undefined)) as
    | (T & { error?: string })
    | undefined;
  if (!response.ok) {
    throw new NewsletterApiError(
      data?.error || `Request failed (${response.status})`,
      response.status,
      data,
    );
  }
  // A 2xx without a JSON body is not a result; saying so beats returning blanks.
  if (!data || typeof data !== "object") {
    throw new NewsletterApiError(
      `Unexpected response (${response.status})`,
      response.status,
    );
  }
  return data;
}

/**
 * Subscribe an address to a digest. Authenticated callers (code given) skip
 * the captcha; anonymous callers must supply `captchaToken` in the input and
 * get double opt-in. The `own` digest type is always authenticated.
 */
export async function subscribeDigestRequest(
  input: DigestSubscribeInput,
  code?: string,
): Promise<DigestSubscribeResult> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(newsletterUrl("/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, ...(code ? { code } : {}) }),
  });
  return parse<DigestSubscribeResult>(response);
}

/** Every live digest subscription attributed to the token's account. */
export async function getDigestSubscriptionsRequest(
  code: string,
): Promise<DigestSubscription[]> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(newsletterUrl("/subscriptions"), {
    headers: { "X-HS-Token": code },
  });
  const data = await parse<{ subscriptions?: DigestSubscription[] }>(response);
  return data.subscriptions ?? [];
}

/** Leave one digest by subscription id. */
export async function leaveDigestRequest(
  id: string,
  code: string,
): Promise<void> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    newsletterUrl(`/subscriptions/${encodeURIComponent(id)}`),
    { method: "DELETE", headers: { "X-HS-Token": code } },
  );
  await parse<{ left: boolean }>(response);
}

/**
 * Suppress ONE address entirely (no Ecency bulk mail to it again). Only that
 * address stops: an account can hold subscriptions under several addresses.
 */
export async function unsubscribeAllDigestsRequest(
  email: string,
  code: string,
): Promise<void> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(newsletterUrl("/unsubscribe-all"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  await parse<{ suppressed: boolean }>(response);
}

/** Sender standing (status, complaint/bounce stats, subscriber counts) for a list. */
export async function getNewsletterSenderRequest(
  type: NewsletterListType,
  target: string,
  code: string,
): Promise<NewsletterSenderStanding> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    newsletterUrl(`/sender?type=${type}&target=${encodeURIComponent(target)}`),
    { headers: { "X-HS-Token": code } },
  );
  return parse<NewsletterSenderStanding>(response);
}

/** Already-sent issues for a list, newest first. */
export async function getNewsletterIssuesRequest(
  type: NewsletterListType,
  target: string,
  code: string,
): Promise<NewsletterSentIssue[]> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    newsletterUrl(`/issues?type=${type}&target=${encodeURIComponent(target)}`),
    { headers: { "X-HS-Token": code } },
  );
  const data = await parse<{ issues?: NewsletterSentIssue[] }>(response);
  return data.issues ?? [];
}

/** Candidate posts for composing a digest issue. */
export async function getNewsletterPostsRequest(
  type: NewsletterListType,
  target: string,
  code: string,
  limit = 20,
): Promise<NewsletterCandidatePost[]> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    newsletterUrl(
      `/posts?type=${type}&target=${encodeURIComponent(target)}&limit=${limit}`,
    ),
    { headers: { "X-HS-Token": code } },
  );
  const data = await parse<{ posts?: NewsletterCandidatePost[] }>(response);
  return data.posts ?? [];
}

async function postSend<T>(
  path: string,
  request: NewsletterSendRequest,
  code: string,
): Promise<T> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(newsletterUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-HS-Token": code },
    body: JSON.stringify(request),
  });
  const data = (await response.json().catch(() => undefined)) as
    | (T & {
        error?: string;
        code?: string;
        taken?: NewsletterSendRefusedError["taken"];
      })
    | undefined;
  if (!response.ok) {
    throw new NewsletterSendRefusedError(
      data?.error || `Request failed (${response.status})`,
      response.status,
      data?.code,
      data?.taken,
      data,
    );
  }
  if (!data || typeof data !== "object") {
    throw new NewsletterSendRefusedError(
      `Unexpected response (${response.status})`,
      response.status,
    );
  }
  return data;
}

/** Render the would-be issue (subject/html/text, counts, taken periods) without sending. */
export function previewNewsletterSendRequest(
  request: NewsletterSendRequest,
  code: string,
): Promise<NewsletterSendPreview> {
  return postSend<NewsletterSendPreview>("/send/preview", request, code);
}

/** Send a post or composed digest to the list's subscribers. Pro/team gated by the relay. */
export function sendNewsletterIssueRequest(
  request: NewsletterSendRequest,
  code: string,
): Promise<NewsletterSendResult> {
  return postSend<NewsletterSendResult>("/send", request, code);
}
