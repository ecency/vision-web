import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";
import { SENDER_TARGET_RE, senderGate } from "@/server/newsletter-sender-gate";

/** The list's issues, newest first, with what became of them. Sender's view (owner, admin, mod; the creator). */
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
  const upstream = await callNewsletter(`/api/issues?type=${type}&target=${encodeURIComponent(target)}`);
  return relay(upstream);
}
