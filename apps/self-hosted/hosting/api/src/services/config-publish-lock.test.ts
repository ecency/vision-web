import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.CONFIG_DIR = mkdtempSync(path.join(tmpdir(), 'hosting-lock-'));

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  withAdvisoryLock: vi.fn(),
}));

vi.mock('../db/client', () => ({
  db: {},
  withAdvisoryLock: mocks.withAdvisoryLock,
}));

vi.mock('./tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    getBlogUrl: (t: any) => `https://${t.username}.blogs.ecency.com`,
  },
}));

const { ConfigService } = await import('./config-service');

const tenant = (title: string, status = 'active') =>
  ({
    username: 'alice',
    subscriptionStatus: status,
    config: {
      version: 1,
      configuration: {
        general: {},
        instanceConfiguration: { username: 'alice', meta: { title } },
      },
    },
  }) as never;

beforeEach(() => {
  mocks.getByUsername.mockReset();
  // Pass-through by default so the ordering assertions below are about the
  // callback, not about the lock implementation.
  mocks.withAdvisoryLock.mockReset().mockImplementation(
    async (_ns: number, _key: number, fn: () => Promise<unknown>) => fn(),
  );
});

/**
 * The listener and the API are separate containers, so the per-tenant promise
 * chain cannot order their writes. Publication therefore has to take a lock
 * that spans processes AND read the tenant inside it: reading before the lock
 * leaves a window where the other process commits a newer config that this
 * write then rolls back.
 */
describe('publishConfigFile', () => {
  it('reads the tenant inside the lock, not before it', async () => {
    const order: string[] = [];
    mocks.withAdvisoryLock.mockImplementation(
      async (_ns: number, _key: number, fn: () => Promise<unknown>) => {
        order.push('lock-acquired');
        const result = await fn();
        order.push('lock-released');
        return result;
      },
    );
    mocks.getByUsername.mockImplementation(async () => {
      order.push('tenant-read');
      return tenant('Fresh');
    });

    await ConfigService.publishConfigFile('alice');

    expect(order).toEqual(['lock-acquired', 'tenant-read', 'lock-released']);
  });

  it('takes the same lock coordinates for the same tenant regardless of case', async () => {
    mocks.getByUsername.mockResolvedValue(tenant('T'));

    await ConfigService.publishConfigFile('alice');
    await ConfigService.publishConfigFile('ALICE');

    const [firstNs, firstKey] = mocks.withAdvisoryLock.mock.calls[0];
    const [secondNs, secondKey] = mocks.withAdvisoryLock.mock.calls[1];
    expect(secondNs).toBe(firstNs);
    expect(secondKey).toBe(firstKey);
    expect(Number.isInteger(firstKey)).toBe(true);
  });

  it('uses different lock coordinates for different tenants', async () => {
    mocks.getByUsername.mockResolvedValue(tenant('T'));

    await ConfigService.publishConfigFile('alice');
    await ConfigService.publishConfigFile('bob');

    expect(mocks.withAdvisoryLock.mock.calls[0][1]).not.toBe(
      mocks.withAdvisoryLock.mock.calls[1][1],
    );
  });

  it('publishes nothing when the tenant is gone or not serving', async () => {
    // Asserting the resolved value proves nothing: publishConfigFile returns
    // Promise<void>, so it resolves to undefined on the writing path too. The
    // absence of the served file is the thing that matters, because nginx
    // serves any file that exists with no subscription check.
    // A name no other test in this file publishes, so a file here can only
    // have come from this call.
    const served = path.join(process.env.CONFIG_DIR as string, 'carol.json');
    const meta = path.join(process.env.CONFIG_DIR as string, 'carol.meta.html');

    mocks.getByUsername.mockResolvedValue(null);
    await ConfigService.publishConfigFile('carol');
    expect(existsSync(served)).toBe(false);
    expect(existsSync(meta)).toBe(false);

    mocks.getByUsername.mockResolvedValue({
      ...(tenant('T', 'inactive') as unknown as Record<string, unknown>),
      username: 'carol',
    } as never);
    await ConfigService.publishConfigFile('carol');
    expect(existsSync(served)).toBe(false);
    expect(existsSync(meta)).toBe(false);
  });

  it('does write the served file for an active tenant', async () => {
    // The counterpart, so the assertion above cannot pass simply because
    // nothing in this suite ever writes.
    const served = path.join(process.env.CONFIG_DIR as string, 'bob.json');
    mocks.getByUsername.mockResolvedValue({
      ...(tenant('Live') as unknown as Record<string, unknown>),
      username: 'bob',
    } as never);

    await ConfigService.publishConfigFile('bob');

    expect(existsSync(served)).toBe(true);
  });
});
