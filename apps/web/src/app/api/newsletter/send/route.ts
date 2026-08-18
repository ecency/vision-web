import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";
import { parseSendBody, senderGate } from "@/server/newsletter-sender-gate";

/**
 * Author send (vision-web#1532): the sender's own post as the list's issue for
 * the current period. The gate here decides WHO may send (Pro creator for their
 * own list; community owner or admin); the service decides what may be sent and
 * whether the period is free, and its answers (403 suspended, 404, 409 taken,
 * 422 refused) are relayed as they are.
 */
export async function POST(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const username = auth.username.toLowerCase();
  const parsed = await parseSendBody(request);
  if (parsed instanceof Response) return parsed;
  const gate = await senderGate(username, parsed.type, parsed.target, "send");
  if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });
  const upstream = await callNewsletter("/api/issues", { method: "POST", body: { ...parsed, requestedBy: username } });
  return relay(upstream);
}
