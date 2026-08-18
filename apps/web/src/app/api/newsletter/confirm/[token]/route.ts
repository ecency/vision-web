import { NextRequest } from "next/server";
import { callNewsletter, newsletterConfigured, notConfigured, relay, TOKEN_RE } from "@/server/newsletter-internal";

/**
 * Confirmation link relay. GET inspects, POST confirms; the page at
 * /newsletter/confirm/[token] does the POST on the person's click, so a link prefetcher
 * following the GET confirms nothing.
 */
async function handle(method: "GET" | "POST", ctx: { params: Promise<{ token: string }> }) {
  if (!newsletterConfigured()) return notConfigured();
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return Response.json({ error: "not found" }, { status: 404 });
  return relay(await callNewsletter(`/confirm/${token}`, { method }));
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return handle("GET", ctx);
}
export async function POST(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return handle("POST", ctx);
}
