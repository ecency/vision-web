import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Leave one subscription. The service only ends it if it belongs to the account we
 * assert, so a wrong or guessed id cannot end someone else's.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!newsletterConfigured()) return notConfigured();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const upstream = await callNewsletter(
    `/api/subscriptions/${encodeURIComponent(id)}?account=${encodeURIComponent(auth.username.toLowerCase())}`,
    { method: "DELETE" }
  );
  return relay(upstream);
}
