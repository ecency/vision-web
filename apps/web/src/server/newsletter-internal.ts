/**
 * Server-only client for the newsletter service (ecency/news).
 *
 * The service is never reached from the browser. Every browser-facing call goes through a
 * route handler here, which holds the service token, establishes identity where identity
 * matters (HiveSigner token verified upstream), and relays. That keeps the service private,
 * keeps its token off the client, and lets this side add what only it knows: the caller's
 * IP and user agent, and server-side entitlement checks (a creator digest is only offered
 * for Ecency Pro creators).
 *
 * Mirrors server/hosting-internal.ts.
 */
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
 * Call the service. `path` starts with `/api/` for token-guarded routes or `/confirm`,
 * `/unsubscribe` for the public token routes; the bearer token is sent either way, the
 * service ignores it where it does not apply. Bounded so a stalled service cannot pile up
 * sockets on the web tier.
 */
export function callNewsletter(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const token = newsletterServiceToken();
  if (!token) throw new Error("newsletter service is not configured");
  return fetch(`${NEWSLETTER_API}${path}`, {
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
