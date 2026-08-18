import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";
import { SENDER_TARGET_RE, senderGate } from "@/server/newsletter-sender-gate";

/** The sender's candidate posts for the composer, filtered by the service, marked when a recent issue carried them. Send gate. */
export async function GET(request: NextRequest): Promise<Response> {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const username = auth.username.toLowerCase();
  const type = request.nextUrl.searchParams.get("type");
  const target = (request.nextUrl.searchParams.get("target") ?? "").toLowerCase();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  if ((type !== "creator" && type !== "community") || !SENDER_TARGET_RE.test(target)) {
    return Response.json({ error: "type must be creator or community, target a valid name" }, { status: 400 });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 40) return Response.json({ error: "limit must be 1..40" }, { status: 400 });
  const gate = await senderGate(username, type, target, "send");
  if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });
  const upstream = await callNewsletter(`/api/posts?type=${type}&target=${encodeURIComponent(target)}&limit=${limit}`);
  return relay(upstream);
}
