/**
 * Server-only client for the newsletter service (ecency/news).
 *
 * The service is never reached from the browser. Every browser-facing call goes through a
 * route handler here, which holds the service token, establishes identity where identity
 * matters (HiveSigner token verified upstream), and relays. That keeps the service private,
 * keeps its token off the client, and lets this side add what only it knows: the caller's
 * IP and user agent, plus the entitlement checks that are ours to make (Ecency Pro to send
 * a chosen post, community roles to send a community's issues, see
 * server/newsletter-sender-gate). Subscribing itself is entitlement-free: every creator is
 * offered a digest.
 *
 * Mirrors server/hosting-internal.ts.
 */
import { EcencyConfigManager } from "@/config";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const NEWSLETTER_API = (process.env.NEWSLETTER_API_URL ?? "").replace(/\/$/, "");

/** Token for the service's /api routes, or null when the feature is not configured. */
export function newsletterServiceToken(): string | null {
  const token = process.env.NEWSLETTER_SERVICE_TOKEN;
  return token && token.length > 0 && NEWSLETTER_API.length > 0 ? token : null;
}

export function newsletterConfigured(): boolean {
  return newsletterServiceToken() !== null;
}

/**
 * The feature as the UI should see it: this deployment is configured for the service AND the
 * config kill switch allows. Read ONLY from server-only places (app/providers.tsx feeds it to
 * the client tree through NewsletterRuntimeProvider; components use useNewsletterEnabled or
 * NewsletterGate). This module imports node:net, so importing it from anything a client
 * bundle can reach, including through the app/_components barrel, breaks the build.
 * Route handlers keep using
 * `newsletterConfigured()`: a switched-off UI must not turn a configured relay into a 503 for
 * emails already in flight (confirmation and unsubscribe links keep working).
 */
export function newsletterFeatureEnabled(): boolean {
  return (
    newsletterConfigured() &&
    EcencyConfigManager.getConfigValue(({ visionFeatures }) => visionFeatures.newsletter.enabled)
  );
}

/**
 * Call the service. `path` starts with `/api/` for token-guarded routes or `/confirm`,
 * `/unsubscribe` for the public token routes; the bearer token is sent either way, the
 * service ignores it where it does not apply. Bounded so a stalled service cannot pile up
 * sockets on the web tier.
 */
export async function callNewsletter(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const token = newsletterServiceToken();
  if (!token) throw new Error("newsletter service is not configured");
  try {
    return await fetch(`${NEWSLETTER_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store"
    });
  } catch (err) {
    // fetch() rejects on the abort and on connection or DNS failure. Left
    // uncaught those became 500s from every route; a service outage should read
    // as what it is, a bad or slow gateway, so the client can say "try again".
    const name = (err as { name?: string })?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return Response.json(
      { error: timedOut ? "Newsletter service timed out" : "Newsletter service unreachable" },
      { status: timedOut ? 504 : 502 }
    );
  }
}

/** Relay a service response as-is: same status, same JSON body. */
export async function relay(upstream: Response): Promise<Response> {
  const data = await upstream.json().catch(() => ({}));
  return Response.json(data, { status: upstream.status });
}

export function notConfigured(): Response {
  return Response.json({ error: "Newsletter is not configured" }, { status: 503 });
}

/**
 * The caller's address, for the consent record. Cloudflare sits in front of production
 * and sets cf-connecting-ip; behind other proxies the first x-forwarded-for hop is the
 * client. Anything that is not a literal IP is dropped rather than sent: the service
 * validates strictly and would refuse the whole request, and a missing IP is a lesser
 * loss than a refused consent.
 */
export function clientIp(request: NextRequest): string | undefined {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf && isIP(cf)) return cf;
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first && isIP(first)) return first;
  return undefined;
}

export function clientUserAgent(request: NextRequest): string | undefined {
  const ua = request.headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : undefined;
}

/** Tokens the service mints are URL-safe; refuse anything else before it reaches a URL path. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
