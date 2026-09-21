import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { NextRequest } from "next/server";
import Turndown from "turndown";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import { getPost } from "@ecency/sdk";
import { metaStringList } from "@/utils/posting";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts/cookies";
import { createPinnedLookup } from "./pinned-lookup";

// Undici dispatcher accepts a custom lookup. We pre-resolve and validate
// every hop's IP via Node's DNS resolver, then pin the TCP connection to
// the IP we approved — closing the DNS-rebinding TOCTOU window between
// resolution and connect. The original hostname rides on the request so
// TLS SNI and certificate validation continue to verify against the
// legitimate host.

interface ArticleData {
  title: string;
  content: string;
  thumbnail: string;
  tags: string[];
  source: "hive" | "external";
}

const HIVE_FRONT_ENDS = [
  "ecency.com",
  "hive.blog",
  "peakd.com",
  "snapie.io",
  "hivesuite.app",
  "leofinance.io",
  "inleo.io"
];

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Expand an IPv6 address to its full 8-group, zero-padded form.
 * e.g. "2001:db8::1" → "2001:0db8:0000:0000:0000:0000:0000:0001"
 */
function expandIPv6(ip: string): string {
  const halves = ip.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  const mid = Array(missing > 0 ? missing : 0).fill("0000");
  const full = [...left, ...mid, ...right];
  return full.map((g) => g.padStart(4, "0")).join(":");
}

/**
 * Check if an IP address (v4 or v6) falls within non-globally-routable ranges.
 * Handles all representations including IPv4-mapped IPv6 (::ffff:x.x.x.x).
 */
function isPrivateIP(ip: string): boolean {
  let normalized = ip;
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) {
    normalized = v4Mapped[1];
  }
  const v4MappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4MappedHex) {
    const high = parseInt(v4MappedHex[1], 16);
    const low = parseInt(v4MappedHex[2], 16);
    normalized = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
  }

  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    const [a, b, c] = parts;
    if (a === 0) return true;                          // 0.0.0.0/8 — "this" network
    if (a === 10) return true;                         // 10.0.0.0/8 — RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
    if (a === 127) return true;                        // 127.0.0.0/8 — loopback
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 — link-local
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 — RFC1918
    if (a === 192 && b === 0 && c === 0) return true;  // 192.0.0.0/24 — IETF protocol
    if (a === 192 && b === 0 && c === 2) return true;  // 192.0.2.0/24 — TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 — 6to4 relay
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16 — RFC1918
    if (a === 198 && b >= 18 && b <= 19) return true;  // 198.18.0.0/15 — benchmark
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 — TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 — TEST-NET-3
    if (a >= 224) return true;                         // 224.0.0.0+ — multicast & reserved
    return false;
  }

  if (isIP(normalized) === 6) {
    // Expand to full 8-group form for reliable prefix matching
    const full = expandIPv6(normalized);
    if (full === "0000:0000:0000:0000:0000:0000:0000:0000") return true; // :: unspecified
    if (full === "0000:0000:0000:0000:0000:0000:0000:0001") return true; // ::1 loopback
    const g1 = parseInt(full.slice(0, 4), 16);
    if (g1 >= 0xfc00 && g1 <= 0xfdff) return true; // fc00::/7 — ULA
    if ((g1 & 0xffc0) === 0xfe80) return true;        // fe80::/10 — link-local
    if (full.startsWith("2001:0db8")) return true;  // 2001:db8::/32 — documentation
    if (full.startsWith("2001:0000")) return true;  // 2001::/32 — Teredo
    if (full.startsWith("0100:0000:0000:0000")) return true; // 100::/64 — discard
    if (g1 >= 0xff00) return true;                  // ff00::/8 — multicast
    return false;
  }

  return true;
}

function assertPublicIP(ip: string) {
  if (isPrivateIP(ip)) {
    throw new Error("BLOCKED_HOST");
  }
}

interface ResolvedTarget {
  /** IP literal to pin the TCP connection to. */
  ip: string;
  /** Address family for the lookup callback (4 or 6). */
  family: 4 | 6;
}

/**
 * Resolve a URL's hostname, validate every returned A+AAAA record against
 * the private/reserved-range blocklist, and return the IP to pin the
 * subsequent fetch to. Throws on any validation failure.
 *
 * Returning the pinned IP closes the DNS-rebinding TOCTOU window: between
 * this resolution and the actual TCP connect, a malicious DNS server could
 * otherwise flip the answer to an internal IP. By pinning the dispatcher's
 * `lookup` to the IP we just validated, the connect can only land on a
 * public address. The URL's hostname is preserved on the request so TLS
 * SNI and certificate validation still verify against the legitimate host.
 */
async function resolveAndValidate(url: string): Promise<ResolvedTarget> {
  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("INVALID_PROTOCOL");
  }

  // Port allowlist. Article sources are always served on the scheme's default
  // web port, so reject any URL carrying an explicit non-default port. This
  // stops the proxy from being aimed at arbitrary TCP services on an otherwise-
  // public host (internal admin panels, databases, mail, etc.) for port-scanning
  // / request laundering. `URL.port` is "" when the port is omitted or equals the
  // scheme default, so default-port URLs pass untouched; an explicit port is
  // allowed only when it matches its own scheme's default (http:80 / https:443),
  // not cross-scheme. resolveAndValidate also runs on every redirect hop, so a
  // redirect to host:port is rejected mid-chain too.
  if (parsed.port !== "") {
    const isDefaultPort =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");
    if (!isDefaultPort) {
      throw new Error("BLOCKED_HOST");
    }
  }

  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

  if (hostname.toLowerCase() === "localhost") {
    throw new Error("BLOCKED_HOST");
  }

  // If hostname is already an IP literal, validate directly
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    assertPublicIP(hostname);
    return { ip: hostname, family: literalFamily };
  }

  // Resolve ALL DNS records and validate every one
  const resolver = new Resolver();
  const [v4Records, v6Records] = await Promise.all([
    resolver.resolve4(hostname).catch(() => [] as string[]),
    resolver.resolve6(hostname).catch(() => [] as string[])
  ]);

  const allIPs = [...v4Records, ...v6Records];
  if (allIPs.length === 0) {
    throw new Error("BLOCKED_HOST");
  }

  // Block if any record resolves to a private/reserved range
  for (const ip of allIPs) {
    assertPublicIP(ip);
  }

  // Prefer the first A record; fall back to AAAA. Both are already validated.
  if (v4Records.length > 0) {
    return { ip: v4Records[0], family: 4 };
  }
  return { ip: v6Records[0], family: 6 };
}

function parseHiveUrl(url: string): { author: string; permlink: string } | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace("www.", "");

    if (!HIVE_FRONT_ENDS.some((fe) => hostname === fe || hostname.endsWith("." + fe))) {
      return null;
    }

    // Patterns: /@author/permlink or /category/@author/permlink. Decode each
    // segment first so percent-encoded handles (e.g. /%40author/ from shared or
    // indexed URLs) are matched, not just the literal "@author" form.
    const segments = parsed.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].startsWith("@") && segments[i + 1]) {
        return {
          author: segments[i].replace("@", ""),
          permlink: segments[i + 1]
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchHivePost(author: string, permlink: string): Promise<ArticleData | null> {
  const post = await getPost(author, permlink);

  if (!post || !post.body) {
    return null;
  }

  return {
    title: post.title || "",
    content: post.body || "",
    // Straight off the chain, so neither field is the list it is declared to be:
    // `image[0]` on a bare string is its first character, and the dialog this feeds
    // types `tags` as a string array.
    thumbnail: metaStringList(post.json_metadata?.image)[0] || "",
    tags: metaStringList(post.json_metadata?.tags),
    source: "hive"
  };
}

/**
 * Fetch a page with size-limited streaming, timeout, and redirect host validation.
 * Each redirect hop is validated via DNS resolution before following.
 */
const MAX_REDIRECTS = 5;

async function fetchPage(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error("FETCH_FAILED");
  }

  const { ip, family } = await resolveAndValidate(url);

  // Per-request dispatcher pinning the TCP connection to the IP we just
  // validated. The lookup callback ignores the hostname argument and
  // returns the pinned IP for every connect attempt this dispatcher makes.
  const dispatcher = new Agent({
    connect: {
      lookup: createPinnedLookup(ip, family)
    }
  });

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // `dispatcher` is an undici-specific option on the global fetch; it
      // isn't in lib.dom.d.ts so we cast through the augmented RequestInit.
      ...({ dispatcher } as { dispatcher: Agent })
    } as RequestInit);

    // Handle redirects manually so each hop is re-resolved AND re-pinned.
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("FETCH_FAILED");
      }
      const redirectUrl = new URL(location, url).toString();
      // Drop the redirect response body before recursing — otherwise the
      // socket stays open against the current dispatcher until finally{}
      // fires, which on a server that streams a long redirect body could
      // hold the connection for the full recursive chain.
      await response.body?.cancel();
      return await fetchPage(redirectUrl, redirectCount + 1);
    }

    if (!response.ok) {
      throw new Error("FETCH_FAILED");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("NOT_HTML");
    }

    // Stream body with size cap
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("FETCH_FAILED");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") +
      decoder.decode();
  } finally {
    // Drain sockets in the background; we don't await because we want the
    // import handler to return as soon as the body is consumed.
    void dispatcher.close().catch(() => { /* best-effort cleanup */ });
  }
}

/**
 * Pre-process HTML before Readability to fix lazy-loaded images.
 * Many sites (Medium, Substack, etc.) use data-src, srcset, or
 * <noscript> wrappers instead of plain <img src>.
 */

// Attributes copied from a noscript-recovered <img>. Everything else
// (including on*, style, srcdoc, etc.) is dropped during migration.
const NOSCRIPT_IMG_ALLOWED_ATTRS = [
  "src", "alt", "title", "width", "height",
  "data-src", "data-original", "data-lazy-src", "srcset"
];

/**
 * Resolve a candidate image src against the document base, then require
 * the absolute form be http(s). Returns the normalized URL or null when
 * the input would resolve to javascript:/data:/file:/etc. or fails to
 * parse. Accepts absolute, protocol-relative, root-relative and
 * document-relative inputs — sites Medium/Substack/etc. lazy-load with
 * any of those forms.
 */
function normalizeImgSrc(candidate: string | null | undefined, baseURI: string): string | null {
  if (!candidate) return null;
  try {
    const absolute = new URL(candidate.trim(), baseURI).toString();
    return /^https?:\/\//i.test(absolute) ? absolute : null;
  } catch {
    return null;
  }
}

function fixLazyImages(document: Document) {
  const baseURI = document.baseURI;
  // DOMParser sourced from the JSDOM window so we can parse untrusted
  // noscript fragments without ever touching innerHTML.
  const view = document.defaultView as (Window & { DOMParser?: typeof DOMParser }) | null;
  const ParserCtor = view?.DOMParser;

  // 1. Unwrap <noscript> images — many sites hide the real <img> inside <noscript>.
  // Parse via DOMParser (no script execution) and migrate only the
  // <img> elements with a whitelisted attribute set. This avoids the
  // innerHTML sink entirely; any script/style/iframe/on*-handlers in
  // the noscript payload are dropped because we don't copy them.
  if (ParserCtor) {
    for (const noscript of Array.from(document.querySelectorAll("noscript"))) {
      const content = noscript.textContent || "";
      if (!/<img\s/i.test(content)) continue;

      const parsed = new ParserCtor().parseFromString(
        `<!DOCTYPE html><body>${content}</body>`,
        "text/html"
      );
      const sourceImgs = Array.from(parsed.querySelectorAll("img"));
      if (sourceImgs.length === 0) continue;

      const wrapper = document.createElement("div");
      for (const sourceImg of sourceImgs) {
        const safe = document.createElement("img");
        for (const attr of NOSCRIPT_IMG_ALLOWED_ATTRS) {
          const v = sourceImg.getAttribute(attr);
          if (v != null) safe.setAttribute(attr, v);
        }
        wrapper.appendChild(safe);
      }
      noscript.parentNode?.replaceChild(wrapper, noscript);
    }
  }

  // 2. Resolve data-src, data-original, data-lazy-src → src
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const currentSrc = img.getAttribute("src");
    const needsSrc = !currentSrc || currentSrc.startsWith("data:");

    const lazySrc =
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-lazy-src");

    const normalizedLazy = normalizeImgSrc(lazySrc, baseURI);
    if (normalizedLazy && needsSrc) {
      img.setAttribute("src", normalizedLazy);
    }

    // 3. Pick highest-res from srcset if src is missing or a placeholder
    const srcset = img.getAttribute("srcset");
    const stillNeedsSrc = !img.getAttribute("src") || img.getAttribute("src")?.startsWith("data:");
    if (srcset && stillNeedsSrc) {
      const best = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .sort((a, b) => {
          const widthA = parseInt(a[1] || "0");
          const widthB = parseInt(b[1] || "0");
          return widthB - widthA;
        })[0];
      const normalizedBest = normalizeImgSrc(best?.[0], baseURI);
      if (normalizedBest) {
        img.setAttribute("src", normalizedBest);
      }
    }

    // 4. Remove tiny tracking pixels / spacer gifs
    const src = img.getAttribute("src") || "";
    const width = parseInt(img.getAttribute("width") || "0");
    const height = parseInt(img.getAttribute("height") || "0");
    if ((width > 0 && width < 3) || (height > 0 && height < 3) || src.includes("stat.") || src.includes("/pixel")) {
      img.remove();
    }
  }
}

async function fetchExternalArticle(url: string): Promise<ArticleData> {
  const html = await fetchPage(url);
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Extract metadata before Readability modifies the DOM
  const ogImage =
    document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") || "";

  // Extract publish date from common meta tags
  const publishDate =
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
    document.querySelector('meta[name="date"]')?.getAttribute("content") ||
    document.querySelector('meta[name="publish_date"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:article:published_time"]')?.getAttribute("content") ||
    document.querySelector("time[datetime]")?.getAttribute("datetime") ||
    "";

  // Fix lazy-loaded images before extraction
  fixLazyImages(document);

  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) {
    throw new Error("EXTRACT_FAILED");
  }

  // Convert extracted HTML to markdown for editor compatibility
  const turndown = new Turndown({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  });
  let markdown = turndown.turndown(article.content || "");

  // Prepend og:image as hero image if the body doesn't already contain it
  if (ogImage && !markdown.includes(ogImage)) {
    markdown = `![](${ogImage})\n\n${markdown}`;
  }

  // Append source attribution with publish date
  const hostname = new URL(url).hostname.replace("www.", "");
  let datePart = "";
  if (publishDate) {
    const parsed = new Date(publishDate);
    if (!isNaN(parsed.getTime())) {
      datePart = ` on ${parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
    }
  }
  markdown += `\n\n---\n*Originally published on [${hostname}](${url})${datePart}*\n`;

  return {
    title: article.title || "",
    content: markdown,
    thumbnail: ogImage,
    tags: [],
    source: "external"
  };
}

const ERROR_CODES: Record<string, string> = {
  INVALID_PROTOCOL: "import-error-invalid-url",
  BLOCKED_HOST: "import-error-invalid-url",
  FETCH_FAILED: "import-error-fetch-failed",
  NOT_HTML: "import-error-not-html",
  RESPONSE_TOO_LARGE: "import-error-too-large",
  EXTRACT_FAILED: "import-error-extract-failed"
};

const ERROR_STATUS: Record<string, number> = {
  INVALID_PROTOCOL: 400,
  BLOCKED_HOST: 400,
  NOT_HTML: 415,
  RESPONSE_TOO_LARGE: 413
};

// ---------------------------------------------------------------------------
// Best-effort per-client rate limit for this public fetch proxy.
//
// State lives in this process's memory and is NOT shared across instances, so
// it is a cheap in-process throttle for casual scripted abuse of the open
// proxy, not the authoritative global limit (which is enforced at the edge). It
// is strictly enforced and never fails open. Anonymous callers get a tighter
// bucket than apparently-logged-in callers.
interface RateBucket {
  tokens: number;
  updated: number;
}

const RL_REFILL_PER_MIN = 10;
const RL_CAPACITY_LOGGED_IN = 10;
const RL_CAPACITY_ANON = 4;
// Hard cap on tracked IPs so the map can't grow unbounded under a spray of
// distinct source IPs; idle entries are also swept once the cap is exceeded.
const RL_MAX_KEYS = 10_000;
const RL_IDLE_MS = 10 * 60_000;

const rlBuckets = new Map<string, RateBucket>();

/**
 * Best-effort client IP from the standard reverse-proxy forwarded headers, in
 * trust order: cf-connecting-ip → x-real-ip → first hop of x-forwarded-for.
 * Falls back to a shared key when no header is present so the limiter still
 * applies rather than silently disengaging.
 */
function getClientIp(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/** Returns true if the request is allowed, false if it should be 429'd. */
function rateLimitOk(request: NextRequest): boolean {
  const now = Date.now();

  // Bound memory: never let the bucket map grow without limit. First sweep idle
  // entries; then, if a spray of always-fresh IPs keeps us over the cap, hard-
  // evict the oldest-inserted entries (Map preserves insertion order) so the
  // map can never exceed RL_MAX_KEYS regardless of how many distinct IPs hit it.
  if (rlBuckets.size > RL_MAX_KEYS) {
    rlBuckets.forEach((b, k) => {
      if (now - b.updated > RL_IDLE_MS) rlBuckets.delete(k);
    });
    let toEvict = rlBuckets.size - RL_MAX_KEYS;
    if (toEvict > 0) {
      rlBuckets.forEach((_b, k) => {
        if (toEvict > 0) {
          rlBuckets.delete(k);
          toEvict -= 1;
        }
      });
    }
  }

  const ip = getClientIp(request);
  // active_user is client-set (NOT httpOnly/signed) so it is forgeable — used
  // ONLY to choose a roomier bucket for apparently-logged-in callers, never as
  // an auth decision.
  const looksLoggedIn = !!request.cookies.get(ACTIVE_USER_COOKIE_NAME)?.value;
  const capacity = looksLoggedIn ? RL_CAPACITY_LOGGED_IN : RL_CAPACITY_ANON;

  let bucket = rlBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: capacity, updated: now };
    rlBuckets.set(ip, bucket);
  } else {
    const refill = ((now - bucket.updated) / 60_000) * RL_REFILL_PER_MIN;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.updated = now;
  }

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (!rateLimitOk(request)) {
    return Response.json(
      { error: "import-failed" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "import-error-invalid-url" }, { status: 400 });
    }

    const url = (body as Record<string, unknown>)?.url;

    if (!url || typeof url !== "string") {
      return Response.json({ error: "import-error-invalid-url" }, { status: 400 });
    }

    try {
      // Early reject of obviously-bad URLs (private IP, non-http(s) scheme,
      // localhost, unresolvable host). fetchPage will re-resolve and pin
      // for the actual request, including each redirect hop.
      await resolveAndValidate(url);
    } catch {
      return Response.json({ error: "import-error-invalid-url" }, { status: 400 });
    }

    // Check if it's a Hive post URL
    const hivePost = parseHiveUrl(url);
    if (hivePost) {
      const result = await fetchHivePost(hivePost.author, hivePost.permlink);
      if (!result) {
        return Response.json(
          { error: "import-error-not-found" },
          { status: 404 }
        );
      }
      return Response.json(result);
    }

    // External article
    const result = await fetchExternalArticle(url);
    return Response.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "";
    const code = ERROR_CODES[message] || "import-failed";
    const status = ERROR_STATUS[message] || 500;
    return Response.json({ error: code }, { status });
  }
}
