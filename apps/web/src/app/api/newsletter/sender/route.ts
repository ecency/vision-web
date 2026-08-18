import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";
import { SENDER_TARGET_RE, senderGate } from "@/server/newsletter-sender-gate";

/**
 * A sender's standing with the newsletter service (vision-web#1513): status,
 * reason, since when, the rolling numbers, and the subscriber counts. Shown to
 * the SENDER only (see senderGate, mode view).
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const username = auth.username.toLowerCase();

  const type = request.nextUrl.searchParams.get("type");
  const target = (request.nextUrl.searchParams.get("target") ?? "").toLowerCase();
  if ((type !== "creator" && type !== "community") || !SENDER_TARGET_RE.test(target)) {
    return Response.json({ error: "type must be creator or community, target a valid name" }, { status: 400 });
  }
  const gate = await senderGate(username, type, target, "view");
  if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });

  const upstream = await callNewsletter(`/api/senders/${type}/${encodeURIComponent(target)}`);
  return relay(upstream);
}
