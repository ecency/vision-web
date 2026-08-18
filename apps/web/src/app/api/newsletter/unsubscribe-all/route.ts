import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";

/**
 * "Stop all Ecency email to this address", from the logged-in settings page.
 *
 * The service trusts the address we pass, so ownership is established HERE: the address
 * must be one the account currently holds a subscription for. Otherwise a logged-in user
 * could suppress any address by typing it.
 */
export async function POST(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return Response.json({ error: "Invalid request" }, { status: 400 });

  const auth = await resolveUser(request, body);
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const account = auth.username.toLowerCase();

  const listed = await callNewsletter(`/api/subscriptions?account=${encodeURIComponent(account)}`);
  if (!listed.ok) return relay(listed);
  const data = (await listed.json().catch(() => ({}))) as { subscriptions?: Array<{ email?: string }> };
  const owned = (data.subscriptions ?? []).some((s) => (s.email ?? "").toLowerCase() === email);
  if (!owned) return Response.json({ error: "That address is not one of yours" }, { status: 403 });

  const upstream = await callNewsletter("/api/unsubscribe-all", { method: "POST", body: { email } });
  return relay(upstream);
}
