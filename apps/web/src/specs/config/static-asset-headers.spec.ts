// @vitest-environment node
import path from "path";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

/**
 * The security headers (CSP, CSP-Report-Only, Permissions-Policy, X-Frame-Options,
 * Referrer-Policy) are document headers. They used to ride on every hashed asset
 * because the block matched `/:path*`, which put ~4.7 KB of headers on each of the
 * ~130 `/_next/static` responses a page makes. Lighthouse counts header bytes in
 * transfer size, so a feed page carried ~600 KB of header weight in PageSpeed's
 * model (#1592). Only that prefix is excluded: a miss there is a text/plain 404,
 * while a miss under /assets or /scripts renders the HTML not-found page, which
 * must keep its clickjacking protection.
 *
 * This evaluates the real `headers()` from next.config.js with Next's own path
 * matcher so the split cannot silently regress.
 */
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const CONFIG = path.resolve(__dirname, "../../../next.config.js");
const SECURITY = [
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only",
  "Permissions-Policy",
  "X-Frame-Options",
  "Referrer-Policy"
];

let rules: HeaderRule[];

beforeAll(async () => {
  // next.config.js is CommonJS; both its production and development exports
  // wrap the same base config, whose headers() is what ships.
  const config = require(CONFIG) as { headers: () => Promise<HeaderRule[]> };
  rules = await config.headers();
});

// Same matcher options the production server uses for the headers manifest
// (next/dist/server/lib/router-utils/filesystem.js).
const MATCH = { strict: true, removeUnnamedParams: true, sensitive: false };

function headersFor(pathname: string): string[] {
  return rules
    .filter((rule) => getPathMatch(rule.source, MATCH)(pathname))
    .flatMap((rule) => rule.headers.map((h) => h.key));
}

describe("security headers stay on documents (#1592)", () => {
  it.each([
    "/",
    "/trending",
    "/@good-karma",
    "/hive-125125",
    "/@ecency/some-post",
    "/api/csp-report",
    "/sw.js",
    "/firebase-messaging-sw.js",
    "/manifest.json",
    "/favicon.ico",
    // Public files keep the block: a miss under these prefixes renders the HTML
    // not-found page, which needs its clickjacking protection.
    "/assets/img/logo-circle.svg",
    "/assets/nope.png",
    "/scripts/x.js",
    "/geo/cities.json",
    // Only the exact prefix is excluded, not routes that merely start with
    // the same letters.
    "/_next/staticx",
    "/_next/static"
  ])("%s carries the full security block", (pathname) => {
    const keys = headersFor(pathname);
    for (const key of SECURITY) expect(keys).toContain(key);
    expect(keys).toContain("X-Content-Type-Options");
  });
});

describe("static responses carry only nosniff + cache headers (#1592)", () => {
  it.each([
    "/_next/static/css/8c78658f5066068d.css",
    "/_next/static/chunks/49542-f010dbacf7effe19.js",
    "/_next/static/media/e4af272ccee01ff0-s.p.woff2",
    "/_next/static/chunks/nope.js"
  ])("%s", (pathname) => {
    const keys = headersFor(pathname);
    for (const key of SECURITY) expect(keys).not.toContain(key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Cache-Control");
  });

  it("keeps the immutable cache policy on hashed assets", () => {
    const rule = rules.find((r) => r.source === "/_next/static/:path*");
    expect(rule).toBeDefined();
    expect(rule!.headers.find((h) => h.key === "Cache-Control")?.value).toBe(
      "public, max-age=31536000, immutable"
    );
  });
});
