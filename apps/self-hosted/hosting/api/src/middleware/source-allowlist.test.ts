import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultGatewayAddress,
  defaultTrustedProxies,
  isAllowedAddress,
  parseAllowlist,
  parseDefaultGateway,
  sourceAllowlist,
} from './source-allowlist';

/**
 * Addresses used below, all from the RFC 5737 documentation ranges.
 *
 * PROXY is deliberately INSIDE the allowlisted range. A trusted proxy that would pass the
 * allowlist on its own is the only way to prove the peer is not being used as a fallback when
 * the header it is trusted for is absent.
 */
const ALLOWED_RANGE = '198.51.100.0/24';
const ALLOWED_IN_RANGE = '198.51.100.4';
const ALLOWED_SINGLE = '203.0.113.9';
const DENIED = '192.0.2.44';
const PROXY = '198.51.100.7';

/**
 * Minimal Hono-shaped context.
 *
 * `env` mirrors the shape @hono/node-server's getConnInfo actually reads (c.env.incoming.socket),
 * so these tests exercise the real accessor rather than a stub of it. Omitting `peer` models a
 * request with no connection info at all, which is what a non-Node runtime would produce.
 *
 * `headers` are the ones the container receives. A test that sets X-Real-IP without a trusted
 * peer is modelling a caller writing the header itself, which is exactly what a request that
 * never traversed nginx can do.
 */
function makeCtx(
  opts: { peer?: string | null; headers?: Record<string, string>; path?: string } = {}
) {
  const { peer, headers = {}, path = '/v1/internal/activate' } = opts;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    env:
      peer === undefined
        ? undefined
        : {
            incoming: {
              socket: {
                // null models a socket that reports no address at all, e.g. one already
                // torn down. The field is simply absent, exactly as Node leaves it.
                remoteAddress: peer ?? undefined,
                remotePort: 54321,
                remoteFamily: peer?.includes(':') ? 'IPv6' : 'IPv4',
              },
            },
          },
    req: {
      path,
      header: (k: string) => lower[k.toLowerCase()],
    },
    json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
  } as any;
}

describe('parseAllowlist', () => {
  it('treats unset, empty and whitespace-only values as not enforcing', () => {
    for (const value of [undefined, '', '   ', ',', ' , ,']) {
      expect(parseAllowlist(value).enforcing).toBe(false);
    }
  });

  it('accepts plain addresses and CIDR, and reports unusable entries', () => {
    const list = parseAllowlist('203.0.113.1, 198.51.100.0/24, ::1, 2001:db8::/32, nonsense, 203.0.113.1/33');
    expect(list.rules).toHaveLength(4);
    expect(list.invalid).toEqual(['nonsense', '203.0.113.1/33']);
    expect(list.enforcing).toBe(true);
  });

  it('rejects malformed IPv4 rather than coercing it', () => {
    // 010 is decimal here and octal elsewhere; 1.2.3 and 256 are simply not addresses.
    expect(parseAllowlist('203.0.113.010').enforcing).toBe(false);
    expect(parseAllowlist('1.2.3').enforcing).toBe(false);
    expect(parseAllowlist('256.0.0.1').enforcing).toBe(false);
  });
});

describe('isAllowedAddress', () => {
  it('matches an exact IPv4 address and nothing else', () => {
    const list = parseAllowlist('203.0.113.7');
    expect(isAllowedAddress('203.0.113.7', list)).toBe(true);
    expect(isAllowedAddress('203.0.113.8', list)).toBe(false);
  });

  it('matches inside an IPv4 CIDR and rejects just outside it', () => {
    const list = parseAllowlist('198.51.100.0/24');
    expect(isAllowedAddress('198.51.100.1', list)).toBe(true);
    expect(isAllowedAddress('198.51.100.254', list)).toBe(true);
    expect(isAllowedAddress('198.51.101.1', list)).toBe(false);
    expect(isAllowedAddress('198.51.99.255', list)).toBe(false);
  });

  it('respects a non-byte-aligned prefix', () => {
    const list = parseAllowlist('192.0.2.128/25');
    expect(isAllowedAddress('192.0.2.128', list)).toBe(true);
    expect(isAllowedAddress('192.0.2.255', list)).toBe(true);
    expect(isAllowedAddress('192.0.2.127', list)).toBe(false);
  });

  it('matches IPv6 addresses and prefixes', () => {
    const list = parseAllowlist('2001:db8:abcd::/48, ::1');
    expect(isAllowedAddress('2001:db8:abcd:1::5', list)).toBe(true);
    expect(isAllowedAddress('2001:db8:abce::1', list)).toBe(false);
    expect(isAllowedAddress('::1', list)).toBe(true);
    expect(isAllowedAddress('[::1]', list)).toBe(true);
    expect(isAllowedAddress('fe80::1%eth0', list)).toBe(false);
  });

  it('treats an IPv4-mapped IPv6 peer as the IPv4 address it is', () => {
    const list = parseAllowlist('203.0.113.7');
    expect(isAllowedAddress('::ffff:203.0.113.7', list)).toBe(true);
    expect(isAllowedAddress('::ffff:203.0.113.8', list)).toBe(false);
    // ...and the same in reverse, when the rule is written in mapped form.
    const mapped = parseAllowlist('::ffff:203.0.113.7');
    expect(isAllowedAddress('203.0.113.7', mapped)).toBe(true);
    expect(isAllowedAddress('203.0.113.8', mapped)).toBe(false);
  });

  it('never matches an unparseable or absent address while enforcing', () => {
    const list = parseAllowlist('203.0.113.0/24');
    expect(isAllowedAddress(null, list)).toBe(false);
    expect(isAllowedAddress('', list)).toBe(false);
    expect(isAllowedAddress('not-an-ip', list)).toBe(false);
  });

  it('does not mix address families', () => {
    expect(isAllowedAddress('::ffff:0:0', parseAllowlist('0.0.0.0/0'))).toBe(true);
    expect(isAllowedAddress('2001:db8::1', parseAllowlist('0.0.0.0/0'))).toBe(false);
  });
});

describe('sourceAllowlist middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  /** Enforcing, with PROXY as the only peer whose X-Real-IP is believed. */
  const enforcing = () =>
    sourceAllowlist({
      name: 'internal',
      value: `${ALLOWED_RANGE}, ${ALLOWED_SINGLE}`,
      trustedProxies: PROXY,
    });

  // The property that protects production: this ships to a host with no staging tier, so an
  // unset variable must behave exactly as it did before this middleware existed.
  it('allows every request when the variable is unset', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: undefined });
    const next = vi.fn();
    await mw(makeCtx({ peer: DENIED, headers: { 'x-real-ip': DENIED } }), next);
    await mw(makeCtx(), next); // no connection info and no headers at all
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('allows every request when the variable is empty', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '   ' });
    const next = vi.fn();
    await mw(makeCtx(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not enforce when the value is set but nothing in it parses', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: 'not-an-ip, also-not-an-ip' });
    const next = vi.fn();
    await mw(makeCtx({ peer: DENIED }), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NOT enforcing'));
  });

  describe('behind a trusted proxy', () => {
    it('allows a listed X-Real-IP', async () => {
      const next = vi.fn();
      await enforcing()(
        makeCtx({ peer: PROXY, headers: { 'x-real-ip': ALLOWED_IN_RANGE } }),
        next
      );
      await enforcing()(makeCtx({ peer: PROXY, headers: { 'x-real-ip': ALLOWED_SINGLE } }), next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('refuses an unlisted X-Real-IP even though the proxy peer itself is listed', async () => {
      const next = vi.fn();
      const res = (await enforcing()(
        makeCtx({ peer: PROXY, headers: { 'x-real-ip': DENIED } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    // No fallback to the peer. PROXY is inside the allowlisted range, so a fallback would let
    // anything that can open a connection to the port through by simply omitting the header.
    it('refuses when X-Real-IP is missing rather than falling back to the peer', async () => {
      const next = vi.fn();
      const res = (await enforcing()(makeCtx({ peer: PROXY }), next)) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    it('refuses an unparseable X-Real-IP rather than falling back to the peer', async () => {
      const next = vi.fn();
      for (const value of ['not-an-ip', '', `${ALLOWED_IN_RANGE}, ${DENIED}`]) {
        const res = (await enforcing()(
          makeCtx({ peer: PROXY, headers: { 'x-real-ip': value } }),
          next
        )) as any;
        expect(res.status).toBe(403);
      }
      expect(next).not.toHaveBeenCalled();
    });

    it('recognises the proxy through an IPv4-mapped peer address', async () => {
      const next = vi.fn();
      await enforcing()(
        makeCtx({ peer: `::ffff:${PROXY}`, headers: { 'x-real-ip': ALLOWED_IN_RANGE } }),
        next
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('trusts loopback by default, without being told to', async () => {
      // No trustedProxies given, so the default set applies. Loopback is in it on every host,
      // which covers a deployment where the proxy talks to the API directly rather than
      // through a container port.
      const mw = sourceAllowlist({ name: 'internal', value: ALLOWED_SINGLE });
      const next = vi.fn();
      await mw(makeCtx({ peer: '127.0.0.1', headers: { 'x-real-ip': ALLOWED_SINGLE } }), next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('not behind a trusted proxy', () => {
    // The case this middleware exists for: a caller that reached the container without passing
    // through the proxy writes its own headers, so the header must count for nothing.
    it('refuses a forged X-Real-IP naming an allowlisted address', async () => {
      const next = vi.fn();
      const res = (await enforcing()(
        makeCtx({ peer: DENIED, headers: { 'x-real-ip': ALLOWED_IN_RANGE } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    it('judges the peer itself, ignoring any X-Real-IP it supplies', async () => {
      const next = vi.fn();
      // A listed peer is allowed even when it forges an UNLISTED header, which proves the
      // header is not consulted at all rather than merely being overridden.
      await enforcing()(
        makeCtx({ peer: ALLOWED_SINGLE, headers: { 'x-real-ip': DENIED } }),
        next
      );
      expect(next).toHaveBeenCalledTimes(1);

      const res = (await enforcing()(makeCtx({ peer: DENIED }), next)) as any;
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(403);
    });

    it('refuses when the connection reports no address', async () => {
      // Default trusted set, so loopback IS trusted here. Substituting any placeholder for a
      // missing peer address would land inside that set and hand the caller its own header.
      const mw = sourceAllowlist({ name: 'internal', value: ALLOWED_SINGLE });
      const next = vi.fn();
      const res = (await mw(
        makeCtx({ peer: null, headers: { 'x-real-ip': ALLOWED_SINGLE } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    it('refuses when there is no connection info to judge', async () => {
      const next = vi.fn();
      const res = (await enforcing()(
        makeCtx({ headers: { 'x-real-ip': ALLOWED_IN_RANGE } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    it('trusts no peer at all when the trusted-proxy set is empty', async () => {
      // An empty set must mean "trust nobody", not "trust everybody": every request is then
      // judged by its peer and X-Real-IP is never read.
      const mw = sourceAllowlist({
        name: 'internal',
        value: `${ALLOWED_RANGE}, ${ALLOWED_SINGLE}`,
        trustedProxies: '',
      });
      const next = vi.fn();
      const res = (await mw(
        makeCtx({ peer: DENIED, headers: { 'x-real-ip': ALLOWED_IN_RANGE } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);

      await mw(makeCtx({ peer: ALLOWED_SINGLE }), next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('refusals', () => {
    it('answer with a generic 403 that does not disclose the allowlist', async () => {
      const next = vi.fn();
      const res = (await enforcing()(makeCtx({ peer: DENIED }), next)) as any;
      expect(res.status).toBe(403);
      // Byte-identical to the shared-secret refusal in routes/internal.ts.
      expect(res.body).toEqual({ error: 'forbidden' });
      expect(JSON.stringify(res.body)).not.toContain('198.51');
      expect(JSON.stringify(res.body)).not.toContain('203.0.113');
    });

    it('log the address judged, the peer, and which of the two it came from', async () => {
      await enforcing()(makeCtx({ peer: DENIED }), vi.fn());
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(DENIED));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('direct'));

      await enforcing()(makeCtx({ peer: PROXY, headers: { 'x-real-ip': DENIED } }), vi.fn());
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('via trusted proxy'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(PROXY));
    });
  });

  describe('X-Forwarded-For is never consulted', () => {
    // It is built with $proxy_add_x_forwarded_for, which appends to whatever the caller sent,
    // so entries in it are caller-controlled even for requests that did traverse the proxy.
    it('does not accept a forged X-Forwarded-For from behind the proxy', async () => {
      const next = vi.fn();
      const res = (await enforcing()(
        makeCtx({
          peer: PROXY,
          headers: { 'x-forwarded-for': `${ALLOWED_IN_RANGE}, ${DENIED}`, 'x-real-ip': DENIED },
        }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });

    it('does not accept X-Forwarded-For in place of a missing X-Real-IP', async () => {
      const next = vi.fn();
      const res = (await enforcing()(
        makeCtx({ peer: PROXY, headers: { 'x-forwarded-for': ALLOWED_IN_RANGE } }),
        next
      )) as any;
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
    });
  });

  it('still enforces the entries that did parse when one is malformed', async () => {
    const mw = sourceAllowlist({
      name: 'internal',
      value: `garbage, ${ALLOWED_RANGE}`,
      trustedProxies: PROXY,
    });
    const next = vi.fn();
    await mw(makeCtx({ peer: PROXY, headers: { 'x-real-ip': ALLOWED_IN_RANGE } }), next);
    expect(next).toHaveBeenCalledTimes(1);
    const res = (await mw(makeCtx({ peer: PROXY, headers: { 'x-real-ip': DENIED } }), next)) as any;
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(403);
  });
});

describe('trusted-proxy defaults', () => {
  // The literal /proc/net/route layout: a header line, then tab-separated fields where a
  // Destination of 00000000 marks the default route and the Gateway is little-endian hex.
  const table = [
    'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
    // On-link subnet route (no next hop), then a route to another subnet VIA 192.0.2.2,
    // then the default route via 192.0.2.1. The middle line is the one that catches a reader
    // that forgets to check Destination: it has a perfectly valid, wrong gateway.
    'eth0\t000200C0\t00000000\t0001\t0\t0\t0\t00FFFFFF\t0\t0\t0',
    'eth0\t000300C0\t020200C0\t0003\t0\t0\t0\t00FFFFFF\t0\t0\t0',
    'eth0\t00000000\t010200C0\t0003\t0\t0\t0\t00000000\t0\t0\t0',
  ].join('\n');

  it('reads the default route gateway, byte order and all', () => {
    // 010200C0 little-endian is C0.00.02.01, and picking the wrong end gives 1.2.0.192.
    // 192.0.2.2 would mean a non-default route was taken for the default one.
    expect(parseDefaultGateway(table)).toBe('192.0.2.1');
  });

  it('returns null when there is no default route or the table is unusable', () => {
    const noDefault = table.split('\n').filter((l) => !l.includes('\t00000000\t010200C0')).join('\n');
    expect(parseDefaultGateway(noDefault)).toBeNull();
    expect(parseDefaultGateway('')).toBeNull();
    expect(parseDefaultGateway('Iface\tDestination\neth0\t00000000\tnothex')).toBeNull();
    // A default route with a zero gateway is a direct link, not a next hop to trust.
    expect(
      parseDefaultGateway('Iface\tDestination\tGateway\neth0\t00000000\t00000000\t0003')
    ).toBeNull();
  });

  it('trusts loopback plus the detected gateway, and nothing else', () => {
    const trusted = defaultTrustedProxies().split(',');
    expect(trusted).toContain('127.0.0.0/8');
    expect(trusted).toContain('::1');
    // The gateway matters because the API is published through a container port: the peer for
    // a proxied request is the bridge address, never loopback. Dropping it would refuse every
    // proxied call the moment the allowlist is switched on.
    const gateway = defaultGatewayAddress();
    if (gateway) {
      expect(trusted).toContain(gateway);
      expect(trusted).toHaveLength(3);
    } else {
      expect(trusted).toHaveLength(2);
    }
  });
});
