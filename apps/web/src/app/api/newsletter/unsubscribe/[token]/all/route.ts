import { NextRequest } from "next/server";
import { callNewsletter, newsletterConfigured, notConfigured, relay, TOKEN_RE } from "@/server/newsletter-internal";

/** Never mail this address again, from an unsubscribe link. POST only. */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!newsletterConfigured()) return notConfigured();
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return Response.json({ error: "not found" }, { status: 404 });
  return relay(await callNewsletter(`/unsubscribe/${token}/all`, { method: "POST" }));
}
