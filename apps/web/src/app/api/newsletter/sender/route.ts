import { NextRequest } from "next/server";
import { getCommunity } from "@ecency/sdk";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";

/**
 * A sender's standing with the newsletter service (vision-web#1513): status,
 * reason, since when, and the rolling numbers. Shown to the SENDER only: the
 * account itself for a creator digest, the community's team (owner, admin,
 * mod) for a community digest. Nobody else has a reason to see another
 * sender's complaint rate.
 */
const TARGET_RE = /^[a-z0-9.-]{1,32}$/;
const TEAM_ROLES = new Set(["owner", "admin", "mod"]);

export async function GET(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const username = auth.username.toLowerCase();

  const type = request.nextUrl.searchParams.get("type");
  const target = (request.nextUrl.searchParams.get("target") ?? "").toLowerCase();
  if ((type !== "creator" && type !== "community") || !TARGET_RE.test(target)) {
    return Response.json({ error: "type must be creator or community, target a valid name" }, { status: 400 });
  }

  if (type === "creator") {
    if (target !== username) return Response.json({ error: "not your digest" }, { status: 403 });
  } else {
    const community = await getCommunity(target, username);
    const role = community?.team?.find(([account]) => account === username)?.[1];
    if (!role || !TEAM_ROLES.has(role)) return Response.json({ error: "not on this community's team" }, { status: 403 });
  }

  const upstream = await callNewsletter(`/api/senders/${type}/${encodeURIComponent(target)}`);
  return relay(upstream);
}
