import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  accounts: new Set<string>(),
  controlled: new Map<string, string[]>(),
}));

vi.mock('../services/tenant-service', () => ({
  // Shared with the payment listener so both recognise a community claim the
  // same way; the real pattern is used here rather than a stub of it.
  COMMUNITY_NAME: /^hive-\d+$/,
  TenantService: {
    verifyHiveAccount: async (name: string) => state.accounts.has(name),
    verifyCommunityControlledBy: async (community: string, account: string) =>
      (state.controlled.get(community) ?? []).includes(account),
  },
}));

const { resolveAndValidateTenant } = await import('./tenants');

function seed() {
  state.accounts = new Set(['alice', 'attacker', 'hive-125125']);
  state.controlled = new Map([['hive-125125', ['alice']]]);
}

/**
 * Whether a request is a community claim has to be decided from the subdomain,
 * not from the caller-supplied config.type. A community account is a real Hive
 * account, so omitting the type used to route the request through the personal
 * blog branch, which only requires owner === username, and let anyone capture a
 * community's subdomain with no ownership check.
 */
describe('resolveAndValidateTenant', () => {
  it('rejects a community name claimed without declaring a type', async () => {
    seed();

    const result = await resolveAndValidateTenant({ username: 'hive-125125' });

    expect(result.ok).toBe(false);
  });

  it('rejects a community name claimed as a personal blog', async () => {
    seed();

    const result = await resolveAndValidateTenant({
      username: 'hive-125125',
      config: { type: 'blog' },
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a community claim by an account that does not administer it', async () => {
    seed();

    const result = await resolveAndValidateTenant({
      username: 'hive-125125',
      owner: 'attacker',
      config: { type: 'community', communityId: 'hive-125125' },
    });

    expect(result.ok).toBe(false);
  });

  it('accepts a community claim by an administrator', async () => {
    seed();

    const result = await resolveAndValidateTenant({
      username: 'hive-125125',
      owner: 'alice',
      config: { type: 'community', communityId: 'hive-125125' },
    });

    expect(result).toEqual({ ok: true, owner: 'alice' });
  });

  it('accepts a community claim that omits the redundant communityId', async () => {
    seed();

    const result = await resolveAndValidateTenant({
      username: 'hive-125125',
      owner: 'alice',
      config: { type: 'community' },
    });

    expect(result).toEqual({ ok: true, owner: 'alice' });
  });

  it('rejects a community id that does not match the subdomain', async () => {
    seed();
    state.accounts.add('hive-999999');

    const result = await resolveAndValidateTenant({
      username: 'hive-999999',
      owner: 'alice',
      config: { type: 'community', communityId: 'hive-125125' },
    });

    expect(result.ok).toBe(false);
  });

  it('still accepts an ordinary personal blog', async () => {
    seed();

    expect(await resolveAndValidateTenant({ username: 'alice' })).toEqual({
      ok: true,
      owner: 'alice',
    });
  });

  it('still rejects a personal blog assigned to a different owner', async () => {
    seed();

    const result = await resolveAndValidateTenant({
      username: 'alice',
      owner: 'attacker',
    });

    expect(result.ok).toBe(false);
  });
});
