import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { callNewsletter, newsletterConfigured, notConfigured, relay } from "@/server/newsletter-internal";

/** The logged-in account's live subscriptions. Identity from the X-HS-Token header. */
export async function GET(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const auth = await resolveUser(request, {});
  if (!auth.ok) return unauthorizedResponse(auth.reason);
  const upstream = await callNewsletter(
    `/api/subscriptions?account=${encodeURIComponent(auth.username.toLowerCase())}`
  );
  return relay(upstream);
}
