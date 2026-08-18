import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";
import { parseSendBody, senderGate } from "@/server/newsletter-sender-gate";

/** What the reader would get, subscriber counts, and which cadences already have this period's issue. Same gate as sending. */
export async function POST(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const username = auth.username.toLowerCase();
  const parsed = await parseSendBody(request);
  if (parsed instanceof Response) return parsed;
  const gate = await senderGate(username, parsed.type, parsed.target, "send");
  if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });
  const upstream = await callNewsletter("/api/issues/preview", { method: "POST", body: parsed });
  return relay(upstream);
}
