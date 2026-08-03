/**
 * Source-address allowlist for the service-to-service routes.
 *
 * The edge nginx already restricts /v1/internal to the callers that use it, but nginx is not
 * the only way into the container: anything with access to the published port or the compose
 * network reaches Hono directly and never passes that check. This is the same restriction
 * expressed one layer in, so a bypass of the edge still has to come from an allowed address.
 *
 * OPT-IN BY DESIGN. An unset or empty allowlist allows every request. There is no staging
 * tier for this service -- a merge deploys straight to the host serving live blogs -- so a
 * default-deny would switch card activation off at merge time for every deployment,
 * including self-hosters who have no allowlist to set. The operator turns it on afterwards
 * by setting the variable on the host.
 */

import type { Context, Next } from 'hono';

/** A parsed allowlist entry: a network address plus how many leading bits must match. */
interface CidrRule {
  bytes: Uint8Array;
  prefix: number;
}

export interface SourceAllowlist {
  /** Rules that parsed. Empty means "not enforcing". */
  rules: CidrRule[];
  /** Entries that did not parse, kept verbatim so a typo is visible in the startup log. */
  invalid: string[];
  /** True when the variable held at least one usable rule. */
  enforcing: boolean;
}

function parseIpv4(value: string): Uint8Array | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    // Leading zeros are rejected rather than normalized: "010" is decimal 10 here and octal 8
    // to some resolvers, and an allowlist that disagrees with the peer about what an entry
    // means is worse than one that refuses it.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out[i] = n;
  }
  return out;
}

function parseIpv6(value: string): Uint8Array | null {
  if (!value.includes(':')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;

  const readGroups = (part: string, out: number[]): boolean => {
    if (part === '') return true;
    const groups = part.split(':');
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.includes('.')) {
        // A dotted tail is only legal as the final 32 bits (e.g. ::ffff:203.0.113.1).
        if (i !== groups.length - 1) return false;
        const v4 = parseIpv4(group);
        if (!v4) return false;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
      out.push(parseInt(group, 16));
    }
    return true;
  };

  const head: number[] = [];
  const tail: number[] = [];
  if (!readGroups(halves[0], head)) return null;
  if (halves.length === 2 && !readGroups(halves[1], tail)) return null;

  let groups: number[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    // "::" stands for at least one all-zero group, so the explicit ones can never fill 8.
    if (head.length + tail.length > 7) return null;
    groups = [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
  }

  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    out[i * 2] = (groups[i] >> 8) & 0xff;
    out[i * 2 + 1] = groups[i] & 0xff;
  }
  return out;
}

/** Bytes for a bare address, or null when it is not an address at all. */
function parseAddress(value: string): Uint8Array | null {
  return value.includes(':') ? parseIpv6(value) : parseIpv4(value);
}

/**
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) is the same host as a.b.c.d, and which of the two forms
 * shows up depends on the socket the request arrived on. Collapse it so an IPv4 rule matches
 * a mapped peer and vice versa.
 */
function collapseMapped(rule: CidrRule): CidrRule {
  const { bytes, prefix } = rule;
  if (bytes.length !== 16 || prefix < 96) return rule;
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) return rule;
  }
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return rule;
  return { bytes: bytes.slice(12), prefix: prefix - 96 };
}

/** Parse one entry: a bare address or CIDR notation. Null when it is unusable. */
function parseRule(entry: string): CidrRule | null {
  // Bracketed IPv6 ("[::1]" / "[::1]/128") is what a URL-shaped value looks like; accept it.
  const unbracketed = entry.replace(/^\[([^\]]+)\](.*)$/, '$1$2');
  const slash = unbracketed.lastIndexOf('/');
  const addressPart = slash === -1 ? unbracketed : unbracketed.slice(0, slash);
  const prefixPart = slash === -1 ? null : unbracketed.slice(slash + 1);

  const bytes = parseAddress(addressPart);
  if (!bytes) return null;

  const maxPrefix = bytes.length * 8;
  let prefix = maxPrefix;
  if (prefixPart !== null) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > maxPrefix) return null;
  }
  return collapseMapped({ bytes, prefix });
}

/** Split the configured value into rules, keeping unusable entries for the log. */
export function parseAllowlist(raw: string | undefined | null): SourceAllowlist {
  const rules: CidrRule[] = [];
  const invalid: string[] = [];
  for (const entry of (raw ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const rule = parseRule(trimmed);
    if (rule) rules.push(rule);
    else invalid.push(trimmed);
  }
  return { rules, invalid, enforcing: rules.length > 0 };
}

function matchesRule(address: Uint8Array, rule: CidrRule): boolean {
  if (address.length !== rule.bytes.length) return false;
  let remaining = rule.prefix;
  for (let i = 0; i < address.length && remaining > 0; i++) {
    const take = remaining >= 8 ? 8 : remaining;
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
    if ((address[i] & mask) !== (rule.bytes[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

/** True when `ip` (a bare address string) falls inside any rule. */
export function isAllowedAddress(ip: string | null | undefined, list: SourceAllowlist): boolean {
  if (!list.enforcing) return true;
  if (!ip) return false;
  // Strip a zone id ("fe80::1%eth0") and any brackets before parsing.
  const cleaned = ip.trim().replace(/^\[([^\]]+)\]$/, '$1').split('%')[0];
  const parsed = parseAddress(cleaned);
  if (!parsed) return false;
  const address = collapseMapped({ bytes: parsed, prefix: parsed.length * 8 }).bytes;
  return list.rules.some((rule) => matchesRule(address, rule));
}

/**
 * The peer address as the fronting nginx saw it.
 *
 * X-Real-IP, NOT X-Forwarded-For. The vhost sets `X-Real-IP $remote_addr`, which REPLACES
 * whatever the client sent, so its value is never client-supplied. X-Forwarded-For is built
 * with `$proxy_add_x_forwarded_for`, which APPENDS the peer to the client's own header: a
 * caller can put any address it likes in there, and only the last element is trustworthy --
 * a position that silently shifts the moment another proxy is inserted in front. Keying an
 * authorization decision on that is a bug waiting for a topology change; the rate limiter can
 * live with it because the worst case there is a wrong bucket, not a granted request.
 *
 * The value is handed to the parser as-is. A comma-joined header (which nginx here never
 * produces) is not an address and simply fails to parse, so it is refused rather than split
 * on a guess about which element is the real one.
 */
function proxyClientIp(c: Context): string | null {
  return c.req.header('x-real-ip')?.trim() || null;
}

export interface SourceAllowlistOptions {
  /** Label used in logs, e.g. 'internal'. */
  name: string;
  /** Raw comma-separated value from the environment. Empty/unset means allow everything. */
  value: string | undefined;
}

/**
 * Middleware factory. The allowlist is parsed once, at construction, so a malformed entry is
 * reported at boot rather than once per request.
 */
export function sourceAllowlist(options: SourceAllowlistOptions) {
  const { name, value } = options;
  const list = parseAllowlist(value);

  // Say at boot which of the three states this is in. "Off" and "on" both look like a working
  // service right up until the day a call is refused, and a typo has to be visible before it
  // is the explanation for something else.
  if (list.invalid.length > 0) {
    console.error(
      `[SourceAllowlist] ${name}: ignoring unparseable entries: ${list.invalid.join(', ')}`
    );
  }
  if (list.enforcing) {
    // Count only. The addresses are already in the environment; no reason to repeat them.
    console.log(`[SourceAllowlist] ${name}: enforcing (${list.rules.length} rule(s))`);
  } else if ((value ?? '').trim().length > 0) {
    // Configured, but nothing in it survived parsing. Enforcing an empty list would deny every
    // caller, so a typo would take card activation down; the edge allowlist is the primary gate
    // and still holds. Loud, and not enforcing.
    console.error(
      `[SourceAllowlist] ${name}: no usable entries; NOT enforcing (fix the value to enable it)`
    );
  } else {
    console.log(`[SourceAllowlist] ${name}: not configured; every source accepted`);
  }

  return async function sourceAllowlistMiddleware(c: Context, next: Next) {
    if (!list.enforcing) return next();

    const ip = proxyClientIp(c);
    if (!isAllowedAddress(ip, list)) {
      // Enough to diagnose (which gate, which address, whether the header was even present)
      // without echoing the allowlist back into the response.
      console.warn(
        `[SourceAllowlist] ${name}: refused ${ip ?? '<no trusted client address>'} for ${c.req.path}`
      );
      // Deliberately identical to the shared-secret refusal, so a prober cannot tell which
      // gate stopped it or learn anything about the allowlist from the body.
      return c.json({ error: 'forbidden' }, 403);
    }

    await next();
  };
}
