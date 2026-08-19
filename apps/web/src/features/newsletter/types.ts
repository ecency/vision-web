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
  targetLabel?: string;
  cadence: DigestCadence;
  source: "community-page" | "creator-page" | "settings" | "landing-page" | "publish-prompt" | "post-page";
}
