import { getCommunity } from "@ecency/sdk";
import type { NextRequest } from "next/server";
import { isProRosterMember } from "@/server/pro-members";

/**
 * Who counts as a list's SENDER, decided in the web tier because it knows Pro
 * membership and community teams; the service trusts what the relay asserts.
 *
 *   view: may see the list's standing and history. The account itself for a
 *         creator list; owner, admin or mod for a community list.
 *   send: may send an issue. A creator only while an Ecency Pro member (the
 *         same gate that offers a creator digest at all); a community's owner
 *         or admin (mods moderate content, mail is heavier).
 */
export type SenderListType = "creator" | "community";
export const SENDER_TARGET_RE = /^[a-z0-9.-]{1,32}$/;

const VIEW_ROLES = new Set(["owner", "admin", "mod"]);
const SEND_ROLES = new Set(["owner", "admin"]);

export type GateResult = { ok: true } | { ok: false; status: 403 | 503; error: string };

export async function senderGate(
  username: string,
  type: SenderListType,
  target: string,
  mode: "view" | "send"
): Promise<GateResult> {
  if (type === "creator") {
    if (target !== username) return { ok: false, status: 403, error: "not your digest" };
    if (mode === "send") {
      const pro = await isProRosterMember(username);
      if (pro === null) return { ok: false, status: 503, error: "membership check unavailable" };
      if (!pro) return { ok: false, status: 403, error: "sending to a creator digest is an Ecency Pro capability" };
    }
    return { ok: true };
  }
  let community: Awaited<ReturnType<typeof getCommunity>>;
  try {
    community = await getCommunity(target, username);
  } catch {
    // The bridge is the authority on the team; without it there is no verdict.
    // A retryable answer, not a framework 500.
    return { ok: false, status: 503, error: "community lookup unavailable" };
  }
  const role = community?.team?.find(([account]) => account === username)?.[1];
  const roles = mode === "send" ? SEND_ROLES : VIEW_ROLES;
  if (!role || !roles.has(role)) {
    return { ok: false, status: 403, error: mode === "send" ? "only the community's owner or admin may send" : "not on this community's team" };
  }
  return { ok: true };
}

const AUTHOR_RE = /^[a-z0-9.-]{3,16}$/;
const PERMLINK_RE = /^[a-z0-9-]{1,256}$/;

export interface SendBody {
  type: "creator" | "community";
  target: string;
  author: string;
  permlink: string;
}

/** The body of a send or preview request, validated; a Response when it is not. */
/** Reads the JSON body once; the same object feeds resolveUser (body.code) and the field validation. */
export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function parseSendBody(body: Record<string, unknown>): SendBody | Response {
  const type = body?.type;
  const target = String(body?.target ?? "").toLowerCase();
  const author = String(body?.author ?? "").toLowerCase();
  const permlink = String(body?.permlink ?? "");
  if ((type !== "creator" && type !== "community") || !SENDER_TARGET_RE.test(target) || !AUTHOR_RE.test(author) || !PERMLINK_RE.test(permlink)) {
    return Response.json({ error: "type, target, author and permlink are required and must be valid" }, { status: 400 });
  }
  return { type, target, author, permlink };
}
