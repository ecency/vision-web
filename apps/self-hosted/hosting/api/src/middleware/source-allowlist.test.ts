import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isAllowedAddress, parseAllowlist, sourceAllowlist } from './source-allowlist';

/**
 * Minimal Hono-shaped context. `headers` are the ones the container actually receives, i.e.
 * after nginx has rewritten them, so a test that forges X-Forwarded-For is modelling a caller
 * that put a value in its own request and nginx passed it along with the peer appended.
 */
function makeCtx(headers: Record<string, string> = {}, path = '/v1/internal/activate') {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
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
  });

  // The property that protects production: this ships to a host with no staging tier, so an
  // unset variable must behave exactly as it did before this middleware existed.
  it('allows every request when the variable is unset', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: undefined });
    const next = vi.fn();
    await mw(makeCtx({ 'x-real-ip': '203.0.113.9' }), next);
    await mw(makeCtx(), next); // no client address at all
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('allows every request when the variable is empty', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '   ' });
    const next = vi.fn();
    await mw(makeCtx(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows an address on the list', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24, 203.0.113.9' });
    const next = vi.fn();
    await mw(makeCtx({ 'x-real-ip': '198.51.100.4' }), next);
    await mw(makeCtx({ 'x-real-ip': '203.0.113.9' }), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('refuses an address off the list with a generic 403 that does not disclose the list', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    const next = vi.fn();
    const res = (await mw(makeCtx({ 'x-real-ip': '192.0.2.44' }), next)) as any;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    // Byte-identical to the shared-secret refusal in routes/internal.ts.
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(JSON.stringify(res.body)).not.toContain('198.51');
  });

  it('logs the refused address so a legitimate caller can be diagnosed', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    await mw(makeCtx({ 'x-real-ip': '192.0.2.44' }), vi.fn());
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('192.0.2.44'));
  });

  // The whole point of reading X-Real-IP: nginx REPLACES it, while X-Forwarded-For is built
  // with $proxy_add_x_forwarded_for and still carries whatever the caller put there.
  it('cannot be bypassed by a forged X-Forwarded-For', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    const next = vi.fn();
    const res = (await mw(
      makeCtx({
        // What the container sees after nginx appended the real peer to the caller's header.
        'x-forwarded-for': '198.51.100.4, 192.0.2.44',
        'x-real-ip': '192.0.2.44',
      }),
      next
    )) as any;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('cannot be bypassed by forging X-Forwarded-For alone', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    const next = vi.fn();
    const res = (await mw(makeCtx({ 'x-forwarded-for': '198.51.100.4' }), next)) as any;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('refuses a request that carries no trusted client address', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    const next = vi.fn();
    const res = (await mw(makeCtx(), next)) as any;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('refuses a multi-valued X-Real-IP instead of guessing which element is real', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: '198.51.100.0/24' });
    const next = vi.fn();
    const res = (await mw(makeCtx({ 'x-real-ip': '198.51.100.4, 192.0.2.44' }), next)) as any;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('does not enforce when the value is set but nothing in it parses', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: 'not-an-ip, also-not-an-ip' });
    const next = vi.fn();
    await mw(makeCtx({ 'x-real-ip': '192.0.2.44' }), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NOT enforcing'));
  });

  it('still enforces the entries that did parse when one is malformed', async () => {
    const mw = sourceAllowlist({ name: 'internal', value: 'garbage, 198.51.100.0/24' });
    const next = vi.fn();
    await mw(makeCtx({ 'x-real-ip': '198.51.100.4' }), next);
    expect(next).toHaveBeenCalledTimes(1);
    const res = (await mw(makeCtx({ 'x-real-ip': '192.0.2.44' }), next)) as any;
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(403);
  });
});
