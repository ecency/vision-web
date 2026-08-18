import { ensureValidToken } from "@/utils";
import { NewsletterApiError } from "./newsletter-api";

/**
 * Author sends (vision-web#1532), browser side of /api/newsletter/send*. Every
 * call carries the HiveSigner token; the route decides who may send. Errors
 * keep the service's status and code so the dialog can say exactly why.
 */
export interface PostRef {
  author: string;
  permlink: string;
}

/** One post, the post being the issue. */
export interface SendRef extends PostRef {
  type: "creator" | "community";
  target: string;
}

/** Several posts with a subject and an intro (news#21). */
export interface ComposeRequest {
  type: "creator" | "community";
  target: string;
  posts: PostRef[];
  subject?: string;
  intro?: string;
}

export type SendRequest = SendRef | ComposeRequest;
export const COMPOSE_MIN = 2;
export const COMPOSE_MAX = 10;
export const SUBJECT_MAX = 120;
export const INTRO_MAX = 500;

export interface CandidatePost extends PostRef {
  title: string;
  created: string;
  featured: boolean;
}

export interface SendPreview {
  subject: string;
  html: string;
  text: string;
  post: { author: string; permlink: string; title: string };
  posts: Array<{ author: string; permlink: string; title: string }>;
  subscribers: { weekly: number; monthly: number };
  alreadySent: Array<"weekly" | "monthly">;
}

export interface SendResult {
  issues: Array<{ issueId: string; cadence: "weekly" | "monthly"; period: string; send: { recipients: number; sent: number; pending: number } }>;
}

export interface SentIssue {
  id: string;
  cadence: "weekly" | "monthly";
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

export class SendRefusedError extends NewsletterApiError {
  constructor(
    message: string,
    status: number,
    public readonly code?: string,
    public readonly taken?: Array<{ cadence: string; period: string; kind: string }>
  ) {
    super(message, status);
  }
}

async function post<T>(path: string, body: unknown, username: string): Promise<T> {
  const token = await ensureValidToken(username);
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-HS-Token": token } : {}) },
    body: JSON.stringify(body)
  });
  const parsed = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; taken?: SendRefusedError["taken"] }) | null;
  if (!res.ok) throw new SendRefusedError(parsed?.error || `Request failed (${res.status})`, res.status, parsed?.code, parsed?.taken);
  // A 2xx without a JSON body is not a result; saying so beats rendering blanks.
  if (!parsed || typeof parsed !== "object") throw new SendRefusedError(`Unexpected response (${res.status})`, res.status);
  return parsed;
}

export const authorSendApi = {
  preview: (req: SendRequest, username: string): Promise<SendPreview> => post<SendPreview>("/api/newsletter/send/preview", req, username),
  send: (req: SendRequest, username: string): Promise<SendResult> => post<SendResult>("/api/newsletter/send", req, username),
  async candidates(type: "creator" | "community", target: string, username: string, limit = 20): Promise<CandidatePost[]> {
    const token = await ensureValidToken(username);
    const res = await fetch(`/api/newsletter/posts?type=${type}&target=${encodeURIComponent(target)}&limit=${limit}`, {
      headers: token ? { "X-HS-Token": token } : {}
    });
    const data = (await res.json().catch(() => ({}))) as { posts?: CandidatePost[]; error?: string };
    if (!res.ok) throw new NewsletterApiError(data?.error || `Request failed (${res.status})`, res.status);
    return data.posts ?? [];
  },
  async issues(type: "creator" | "community", target: string, username: string): Promise<SentIssue[]> {
    const token = await ensureValidToken(username);
    const res = await fetch(`/api/newsletter/issues?type=${type}&target=${encodeURIComponent(target)}`, {
      headers: token ? { "X-HS-Token": token } : {}
    });
    const data = (await res.json().catch(() => ({}))) as { issues?: SentIssue[]; error?: string };
    if (!res.ok) throw new NewsletterApiError(data?.error || `Request failed (${res.status})`, res.status);
    return data.issues ?? [];
  }
};
