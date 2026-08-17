import { NextRequest } from "next/server";
import { callNewsletter, newsletterConfigured, notConfigured, relay, TOKEN_RE } from "@/server/newsletter-internal";

/** Unsubscribe link relay: GET inspects, POST leaves that one subscription. */
async function handle(method: "GET" | "POST", ctx: { params: Promise<{ token: string }> }) {
  if (!newsletterConfigured()) return notConfigured();
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return Response.json({ error: "not found" }, { status: 404 });
  return relay(await callNewsletter(`/unsubscribe/${token}`, { method }));
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return handle("GET", ctx);
}
export async function POST(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return handle("POST", ctx);
}
