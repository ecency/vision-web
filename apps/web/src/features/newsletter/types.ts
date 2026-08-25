export type DigestType = "own" | "community" | "creator" | "site";
export type DigestCadence = "weekly" | "monthly";
export type DigestStatus = "active" | "pending_confirmation" | "suppressed" | "ended";

export interface DigestSubscription {
  id: string;
  email: string;
  account: string | null;
  type: DigestType | "own";
  target: string;
  cadence: DigestCadence;
  status: DigestStatus;
  created_at: string;
}

export interface SubscribeResult {
  status: "active" | "pending_confirmation" | "refused";
  subscription?: DigestSubscription;
  created?: boolean;
  confirmationSent?: boolean;
  reason?: "suppressed";
}

export interface SubscribeInput {
  email: string;
  type: DigestType;
  target: string;
  cadence: DigestCadence;
  /**
   * Kept in lockstep with SOURCES in app/api/newsletter/subscribe/route.ts by hand: a
   * value here that the route does not accept is a silent 400 with a generic message.
   * "self-hosted-blog" is the managed-blog embed, which posts to the same route.
   */
  source:
    | "community-page"
    | "creator-page"
    | "settings"
    | "landing-page"
    | "publish-prompt"
    | "post-page"
    | "self-hosted-blog"
    | "mobile-app";
  /**
   * Cloudflare Turnstile token. Required by the route whenever the caller has no
   * account; ignored for signed-in callers, whose account is the proof.
   */
  captchaToken?: string;
}
