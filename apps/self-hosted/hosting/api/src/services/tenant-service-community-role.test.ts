import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  response: null as unknown,
  shouldThrow: false,
}));

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: async () => {
    if (state.shouldThrow) throw new Error('rpc down');
    return state.response;
  },
  config: { set: () => {} },
  setNodes: () => {},
}));

const { TenantService } = await import('./tenant-service');

function community(team: unknown) {
  return { name: 'hive-125125', team };
}

/**
 * Verifying only that the community exists let any account pay for, and then
 * permanently hold, the instance of a community it has no part in: every later
 * mutation authorises against tenants.owner, so the real team could never
 * reclaim it.
 */
describe('verifyCommunityControlledBy', () => {
  it('accepts an admin of the community', async () => {
    state.response = community([
      ['hive-125125', 'owner', ''],
      ['alice', 'admin', ''],
    ]);

    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
    ).toBe(true);
  });

  it('accepts an account holding the owner role', async () => {
    state.response = community([['alice', 'owner', '']]);

    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
    ).toBe(true);
  });

  it('is case insensitive on the account name', async () => {
    state.response = community([['Alice', 'Admin', '']]);

    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
    ).toBe(true);
  });

  it('rejects an account with no role in the community', async () => {
    state.response = community([
      ['hive-125125', 'owner', ''],
      ['bob', 'admin', ''],
    ]);

    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'attacker'),
    ).toBe(false);
  });

  it('rejects a mod, a member and a muted account', async () => {
    for (const role of ['mod', 'member', 'guest', 'muted']) {
      state.response = community([['alice', role, '']]);

      expect(
        await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
      ).toBe(false);
    }
  });

  it('rejects when the community does not exist or the name does not match', async () => {
    state.response = null;
    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
    ).toBe(false);

    state.response = { name: 'hive-999999', team: [['alice', 'admin', '']] };
    expect(
      await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
    ).toBe(false);
  });

  it('rejects when the team is missing or malformed', async () => {
    for (const team of [undefined, null, 'admin', [null], [['alice']], [{ 0: 'alice' }]]) {
      state.response = community(team);

      expect(
        await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
      ).toBe(false);
    }
  });

  it('fails closed when the node call throws', async () => {
    state.shouldThrow = true;

    try {
      expect(
        await TenantService.verifyCommunityControlledBy('hive-125125', 'alice'),
      ).toBe(false);
    } finally {
      state.shouldThrow = false;
    }
  });
});
