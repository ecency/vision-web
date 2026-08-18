import { ensureValidToken } from "@/utils";
import type { DigestSubscription, SubscribeInput, SubscribeResult } from "./types";

/**
 * Browser-side client for the newsletter route handlers. Everything goes through
 * /api/newsletter/*, never to the newsletter service directly.
 *
 * Identity for logged-in calls is the HiveSigner access token, sent as `code` in a POST
 * body or as X-HS-Token on GET/DELETE, exactly as the hosting and 3Speak proxies do; the
 * route handler verifies it upstream and derives the account from it. The token is
 * obtained with ensureValidToken(), which AWAITS a refresh when the stored one has
 * expired; getAccessToken() only kicks off a background refresh and hands back the
 * expired token, and the first request after a long absence then 401s and leaves the
 * subscriptions query in an error state.
 */
export class NewsletterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new NewsletterApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

async function authHeaders(username?: string | null): Promise<Record<string, string>> {
  const token = username ? await ensureValidToken(username) : null;
  return token ? { "X-HS-Token": token } : {};
}

export const newsletterApi = {
  async subscribe(input: SubscribeInput, username?: string | null): Promise<SubscribeResult> {
    const code = username ? await ensureValidToken(username) : null;
    const res = await fetch("/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, ...(code ? { code } : {}) })
    });
    return parse<SubscribeResult>(res);
  },

  async list(username: string): Promise<DigestSubscription[]> {
    const res = await fetch("/api/newsletter/subscriptions", { headers: await authHeaders(username) });
    const data = await parse<{ subscriptions: DigestSubscription[] }>(res);
    return data.subscriptions ?? [];
  },

  async leave(id: string, username: string): Promise<void> {
    const res = await fetch(`/api/newsletter/subscriptions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await authHeaders(username)
    });
    await parse<{ left: boolean }>(res);
  },

  async unsubscribeAll(email: string, username: string): Promise<void> {
    const code = await ensureValidToken(username);
    const res = await fetch("/api/newsletter/unsubscribe-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    await parse<{ suppressed: boolean }>(res);
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
