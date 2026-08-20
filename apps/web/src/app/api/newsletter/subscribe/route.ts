import { NextRequest } from "next/server";
import { resolveUser, unauthorizedResponse } from "@/app/api/threespeak/resolve-user";
import { verifyTurnstile } from "@/server/turnstile-verify";
import {
  callNewsletter,
  clientIp,
  clientUserAgent,
  newsletterConfigured,
  notConfigured,
  relay
} from "@/server/newsletter-internal";

const TYPES = new Set(["own", "community", "creator", "site"]);
const CADENCES = new Set(["weekly", "monthly"]);
/**
 * Newsletter tokens are scoped to this action. The sitekey is shared with signup, so
 * without it a challenge solved on the signup page would be spendable here.
 */
const TURNSTILE_ACTION = "newsletter-subscribe";

const SOURCES = new Set(["community-page", "creator-page", "settings", "landing-page", "publish-prompt", "post-page", "self-hosted-blog"]);

/**
 * Subscribe to a community or creator digest.
 *
 * Anonymous callers are allowed: they supply an address and get double opt-in from the
 * service, and since 2026-08 they also clear a Turnstile check, because the request makes
 * us send mail to an address nobody has proven they own. A logged-in caller (HiveSigner token in body.code) is attributed to their
 * account, which is what lets the service treat a later subscribe on a confirmed address
 * as one action, and what allows an opted-out address to be re-confirmed. The account is
 * taken from the verified token, never from the body.
 *
 * Every creator is offered a digest (decided 2026-08-19), so this route checks no
 * entitlement at all: a reader may subscribe to any account, and the automatic issues go
 * out for any list that has readers. Ecency Pro gates the active capabilities instead,
 * sending a chosen post and composing an issue, which server/newsletter-sender-gate checks
 * on the send routes.
 * The site digest (`type: "site"`, the homepage form) has one target, `ecency`, which the
 * service enforces.
 */
export async function POST(request: NextRequest) {
  if (!newsletterConfigured()) return notConfigured();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const type = typeof body.type === "string" ? body.type : "";
  const target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";
  const cadence = typeof body.cadence === "string" ? body.cadence : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const source = typeof body.source === "string" ? body.source : "";
  if (!TYPES.has(type) || !target || !CADENCES.has(cadence) || !email || !SOURCES.has(source)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  let account: string | undefined;
  if (typeof body.code === "string" && body.code.length > 0) {
    const auth = await resolveUser(request, body);
    if (!auth.ok) return unauthorizedResponse(auth.reason);
    account = auth.username.toLowerCase();
  }

  // The own-notification digest is by definition the signed-in account's own:
  // it needs a verified account, and its target IS that account. The service
  // enforces the same; refusing here keeps a forged target from ever leaving.
  if (type === "own") {
    if (!account) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (target !== account) return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // An anonymous subscribe makes us send mail to an address nobody has proven they
  // own, so it clears a bot check first. Deliberately keyed on "is there a verified
  // account" and nothing else: `source` is caller-supplied, so exempting a source
  // would mean one JSON field turns the whole check off.
  //
  // Placed after the `own` check on purpose. An anonymous own-digest request can never
  // succeed, so it should 401 without spending a siteverify round trip.
  if (!account) {
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : "";
    const verdict = await verifyTurnstile(captchaToken, clientIp(request), TURNSTILE_ACTION);
    if (!verdict.ok && verdict.reason === "invalid") {
      return Response.json({ error: "Security check failed" }, { status: 403 });
    }
    if (!verdict.ok && verdict.reason === "unavailable") {
      return Response.json({ error: "Security check unavailable" }, { status: 503 });
    }
    // "unconfigured" relays. A deploy that reaches this code before TURNSTILE_SECRET
    // reaches its environment must not take every anonymous subscribe down with it;
    // specs/deploy/newsletter-wiring pins the variable so the gap is a test failure
    // rather than a silently disabled check.
  }

  const upstream = await callNewsletter("/api/subscriptions", {
    method: "POST",
    body: {
      email,
      account,
      type,
      target,
      cadence,
      source,
      sourceIp: clientIp(request),
      userAgent: clientUserAgent(request)
    }
  });
  return relay(upstream);
}
