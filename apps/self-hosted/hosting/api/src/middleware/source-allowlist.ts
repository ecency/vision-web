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
 *
 * WHERE THE CLIENT ADDRESS COMES FROM. The socket peer first, `X-Real-IP` only when that peer
 * is a proxy we trust. Headers are only as good as whoever last wrote them: the vhost sets
 * `X-Real-IP $remote_addr`, which replaces what the client sent, but that is a statement about
 * requests that went through the vhost. The requests this middleware exists for are the ones
 * that did not, and for those the caller writes every header itself, so believing X-Real-IP
 * unconditionally would hand any direct caller an allowlisted identity for free. Reading the
 * peer first and consulting the header only behind it keeps the header's guarantee tied to
 * the thing that actually provides it.
 *
 * What this can and cannot reach, given how the API is published (loopback-only port, plus
 * the compose network):
 *  - another container on the compose network is a distinct peer address and is checked as
 *    itself, which is the case this defends;
 *  - a process on the host itself is indistinguishable from the proxy, because both arrive
 *    through the same published port. Nothing at this layer can separate them; the shared
 *    secret is what stands behind it there, and a process on that host can read the secret
 *    out of the environment anyway.
 */

import type { Context, Next } from 'hono';
import { readFileSync } from 'node:fs';
import { getConnInfo } from '@hono/node-server/conninfo';

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

/**
 * Strict membership: does `ip` fall inside any of these rules. An EMPTY rule set matches
 * nothing. Separate from isAllowedAddress below, which deliberately answers "yes" for a list
 * that is not enforcing -- convenient for the allowlist, catastrophic for the trusted-proxy
 * set, where "no rules" must mean "trust no peer" and not "trust every peer".
 */
function addressInRules(ip: string | null | undefined, rules: CidrRule[]): boolean {
  if (!ip) return false;
  // Strip a zone id ("fe80::1%eth0") and any brackets before parsing.
  const cleaned = ip.trim().replace(/^\[([^\]]+)\]$/, '$1').split('%')[0];
  const parsed = parseAddress(cleaned);
  if (!parsed) return false;
  const address = collapseMapped({ bytes: parsed, prefix: parsed.length * 8 }).bytes;
  return rules.some((rule) => matchesRule(address, rule));
}

/** True when `ip` falls inside any rule, or when the list is not enforcing at all. */
export function isAllowedAddress(ip: string | null | undefined, list: SourceAllowlist): boolean {
  if (!list.enforcing) return true;
  return addressInRules(ip, list.rules);
}

/**
 * The socket peer, via the Node adapter's ConnInfo helper. This API runs on Node
 * (`node:24-alpine` running `tsx src/index.ts`, served by `@hono/node-server`), so this is the
 * matching accessor; it reads `remoteAddress` off the underlying `IncomingMessage` socket.
 *
 * It throws rather than returning undefined when the request did not come from that adapter,
 * so it is guarded: an unknown peer is treated as untrusted, which refuses while enforcing.
 */
function peerAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The container's default gateway, read from the routing table.
 *
 * This is what makes "the request came in through the host" checkable. The API publishes to a
 * loopback port on the host and Docker forwards that to the container, so the peer the
 * container observes for a proxied request is NOT loopback: it is the bridge address, which is
 * also the container's default gateway. Verified on the deployed host, where a request to the
 * published port arrives from the bridge address while a sibling container on the same compose
 * network arrives as its own distinct address.
 *
 * Detected rather than configured, because it differs per deployment (bridge subnets are
 * assigned by Docker) and a wrong value would refuse every proxied call. A deployment where
 * the API is not containerised has nginx talking to loopback directly, which is covered by the
 * loopback rules alongside this.
 *
 * Split from the file read so the format handling is testable against a literal table.
 */
export function parseDefaultGateway(routeTable: string): string | null {
  for (const line of routeTable.split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/);
    // Destination 00000000 is the default route; field 2 is its gateway.
    if (fields.length < 3 || fields[1] !== '00000000') continue;
    const hex = fields[2];
    if (!/^[0-9A-Fa-f]{8}$/.test(hex)) continue;
    // Stored little-endian, so the four bytes read backwards.
    const bytes = [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16)).reverse();
    if (bytes.every((b) => b === 0)) continue;
    return bytes.join('.');
  }
  return null;
}

/** The default gateway of the machine this process runs on, or null if it cannot be read. */
export function defaultGatewayAddress(): string | null {
  try {
    return parseDefaultGateway(readFileSync('/proc/net/route', 'utf8'));
  } catch {
    // No /proc (non-Linux, or a locked-down filesystem). Loopback alone still applies.
    return null;
  }
}

/**
 * Peers whose X-Real-IP is believed: loopback, plus the default gateway when there is one.
 * Loopback covers an uncontainerised deployment; the gateway covers this one. Neither is an
 * address a sibling container can present, since each of those has its own bridge address.
 */
export function defaultTrustedProxies(): string {
  const gateway = defaultGatewayAddress();
  return ['127.0.0.0/8', '::1', ...(gateway ? [gateway] : [])].join(',');
}

export interface SourceAllowlistOptions {
  /** Label used in logs, e.g. 'internal'. */
  name: string;
  /** Raw comma-separated value from the environment. Empty/unset means allow everything. */
  value: string | undefined;
  /**
   * Peers whose X-Real-IP is trusted, same syntax as `value`. Defaults to loopback plus the
   * detected default gateway. A parameter rather than another environment variable: the
   * default is derived from the machine it runs on, and an operator-supplied version of it is
   * one more value to get wrong at 2am for no gain. Tests set it explicitly.
   */
  trustedProxies?: string;
}

/**
 * Middleware factory. The allowlist is parsed once, at construction, so a malformed entry is
 * reported at boot rather than once per request.
 */
export function sourceAllowlist(options: SourceAllowlistOptions) {
  const { name, value } = options;
  const list = parseAllowlist(value);
  // Only needed while enforcing, and detecting it costs a file read, so skip it otherwise.
  const trusted = list.enforcing
    ? parseAllowlist(options.trustedProxies ?? defaultTrustedProxies())
    : parseAllowlist('');

  // Say at boot which of the three states this is in. "Off" and "on" both look like a working
  // service right up until the day a call is refused, and a typo has to be visible before it
  // is the explanation for something else.
  if (list.invalid.length > 0) {
    console.error(
      `[SourceAllowlist] ${name}: ignoring unparseable entries: ${list.invalid.join(', ')}`
    );
  }
  if (list.enforcing) {
    // Counts only. The addresses are already in the environment; no reason to repeat them.
    // The trusted-proxy count is here because a zero would mean every request is judged by its
    // peer and no X-Real-IP is ever read, which explains an otherwise baffling wall of 403s.
    console.log(
      `[SourceAllowlist] ${name}: enforcing (${list.rules.length} rule(s),` +
        ` ${trusted.rules.length} trusted proxy rule(s))`
    );
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

    const peer = peerAddress(c);
    // Behind a proxy we trust, the caller's identity is the header that proxy wrote, and ONLY
    // that: no falling back to the peer if it is missing or malformed, because the peer there
    // is the proxy itself and falling back would admit anything that can open a connection to
    // the port. Everywhere else the peer IS the caller and the header is just something the
    // caller typed, so it is ignored outright.
    const viaTrustedProxy = addressInRules(peer, trusted.rules);
    const claimed = viaTrustedProxy ? c.req.header('x-real-ip')?.trim() || null : peer;

    if (!isAllowedAddress(claimed, list)) {
      // Enough to diagnose: which gate, the address judged, and whether it came from the peer
      // or from a proxy's header, which is the difference between "add this to the allowlist"
      // and "this did not come through the proxy at all". The allowlist is never echoed back.
      console.warn(
        `[SourceAllowlist] ${name}: refused ${claimed ?? '<none>'} for ${c.req.path}` +
          ` (peer ${peer ?? '<unknown>'}, ${viaTrustedProxy ? 'via trusted proxy' : 'direct'})`
      );
      // Deliberately identical to the shared-secret refusal, so a prober cannot tell which
      // gate stopped it or learn anything about the allowlist from the body.
      return c.json({ error: 'forbidden' }, 403);
    }

    await next();
  };
}
