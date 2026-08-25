import { ensureValidToken } from "@/utils";
import {
  NewsletterApiError,
  getDigestSubscriptionsRequest,
  leaveDigestRequest,
  subscribeDigestRequest,
  unsubscribeAllDigestsRequest,
} from "@ecency/sdk";
import type { DigestSubscription, SubscribeInput, SubscribeResult } from "./types";

/**
 * Web wrapper over the SDK newsletter client (which owns the transport,
 * shared with mobile). What stays here is web-specific: identity for
 * logged-in calls is sourced with ensureValidToken(), which AWAITS a refresh
 * when the stored token has expired; getAccessToken() only kicks off a
 * background refresh and hands back the expired token, and the first request
 * after a long absence then 401s and leaves the subscriptions query in an
 * error state.
 *
 * The email-token confirm/unsubscribe flows below stay web-local relative
 * fetches: their pages exist only on the web origin and the SDK deliberately
 * does not carry them.
 */
export { NewsletterApiError };

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new NewsletterApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

export const newsletterApi = {
  async subscribe(input: SubscribeInput, username?: string | null): Promise<SubscribeResult> {
    const code = username ? await ensureValidToken(username) : null;
    return subscribeDigestRequest(input, code ?? undefined);
  },

  async list(username: string): Promise<DigestSubscription[]> {
    return getDigestSubscriptionsRequest((await ensureValidToken(username)) ?? "");
  },

  async leave(id: string, username: string): Promise<void> {
    await leaveDigestRequest(id, (await ensureValidToken(username)) ?? "");
  },

  async unsubscribeAll(email: string, username: string): Promise<void> {
    await unsubscribeAllDigestsRequest(email, (await ensureValidToken(username)) ?? "");
  },

  // Link-driven flows. GET inspects, POST acts.
  async inspectConfirm(token: string) {
    return parse<{ email: string; subscriptions: Array<Pick<DigestSubscription, "type" | "target" | "cadence" | "status">> }>(
      await fetch(`/api/newsletter/confirm/${encodeURIComponent(token)}`)
    );
  },
  async confirm(token: string) {
    return parse<{ confirmed: boolean; email: string; subscriptions: Array<Pick<DigestSubscription, "type" | "target" | "cadence" | "status">> }>(
      await fetch(`/api/newsletter/confirm/${encodeURIComponent(token)}`, { method: "POST" })
    );
  },
  async inspectUnsubscribe(token: string) {
    return parse<{
      email: string;
      subscription: { type: string; target: string; cadence: string; ended: boolean };
      otherSubscriptions: number;
    }>(await fetch(`/api/newsletter/unsubscribe/${encodeURIComponent(token)}`));
  },
  async unsubscribeOne(token: string) {
    return parse<{ left: boolean; alreadyEnded: boolean }>(
      await fetch(`/api/newsletter/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" })
    );
  },
  async unsubscribeEverything(token: string) {
    return parse<{ suppressed: boolean; email: string }>(
      await fetch(`/api/newsletter/unsubscribe/${encodeURIComponent(token)}/all`, { method: "POST" })
    );
  }
};
