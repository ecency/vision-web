export type DigestType = "own" | "community" | "creator" | "site" | "tag";
export type DigestCadence = "weekly" | "monthly";
export type DigestStatus = "active" | "pending_confirmation" | "suppressed" | "ended";

/** The two list types that have a sender side (own/site digests are system-sent). */
export type NewsletterListType = "creator" | "community";

export interface DigestSubscription {
  id: string;
  email: string;
  account: string | null;
  type: DigestType;
  target: string;
  cadence: DigestCadence;
  status: DigestStatus;
  created_at: string;
}

/**
 * Where the subscribe request originated. The relay keeps a closed allowlist
 * (apps/web/src/app/api/newsletter/subscribe/route.ts SOURCES) — a value the
 * route does not accept is a silent 400, so additions land there first.
 */
export type DigestSubscribeSource =
  | "community-page"
  | "creator-page"
  | "settings"
  | "landing-page"
  | "publish-prompt"
  | "post-page"
  | "self-hosted-blog"
  | "mobile-app"
  | "tag-page"
  | "tag-chip";

export interface DigestSubscribeInput {
  email: string;
  type: DigestType;
  target: string;
  cadence: DigestCadence;
  source: DigestSubscribeSource;
  /**
   * Cloudflare Turnstile token. Required by the relay whenever the caller has
   * no verified account; ignored for authenticated callers, whose account is
   * the proof.
   */
  captchaToken?: string;
}

export interface DigestSubscribeResult {
  status: "active" | "pending_confirmation" | "refused";
  /** Proven (authenticated or already-confirmed) callers only. */
  subscription?: DigestSubscription;
  created?: boolean;
  confirmationSent?: boolean;
  reason?: "suppressed";
}

export interface NewsletterPostRef {
  author: string;
  permlink: string;
}

/** One post, the post being the issue. */
export interface NewsletterSendRef extends NewsletterPostRef {
  type: NewsletterListType;
  target: string;
}

/** Several posts with a subject and an intro. */
export interface NewsletterComposeRequest {
  type: NewsletterListType;
  target: string;
  posts: NewsletterPostRef[];
  subject?: string;
  intro?: string;
}

export type NewsletterSendRequest = NewsletterSendRef | NewsletterComposeRequest;

export interface NewsletterCandidatePost extends NewsletterPostRef {
  title: string;
  created: string;
  featured: boolean;
}

export interface NewsletterSendPreview {
  subject: string;
  html: string;
  text: string;
  post: { author: string; permlink: string; title: string };
  posts: Array<{ author: string; permlink: string; title: string }>;
  subscribers: { weekly: number; monthly: number };
  alreadySent: DigestCadence[];
}

export interface NewsletterSendResult {
  issues: Array<{
    issueId: string;
    cadence: DigestCadence;
    period: string;
    send: { recipients: number; sent: number; pending: number };
  }>;
}

export interface NewsletterSentIssue {
  id: string;
  cadence: DigestCadence;
  kind: "digest" | "post";
  period_start: string;
  subject: string;
  status: string;
  post_author: string | null;
  post_permlink: string | null;
  requested_by: string | null;
  created_at: string;
  delivered: number;
  bounced: number;
  rejected: number;
}

export interface NewsletterSenderStanding {
  type: DigestType;
  target: string;
  status: "active" | "suspended";
  reason: string | null;
  since: string | null;
  stats: {
    delivered: number;
    bounced: number;
    rejected: number;
    complaints: number;
    unsubscribed: number;
    complaintRate: number;
    bounceRate: number;
  };
  /** Live, mailable subscribers per cadence. */
  subscribers?: { weekly: number; monthly: number };
}
