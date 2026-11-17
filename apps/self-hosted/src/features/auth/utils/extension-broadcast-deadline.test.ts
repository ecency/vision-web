import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastWithExtension } from './hive-extensions';
import { broadcast } from './keychain';

// #2125: a tip or transfer was reported as failed at 30 seconds while the
// wallet popup was still open, and a later approval still broadcast it, so a
// retry paid twice. Once the extension has answered the liveness ping, the
// broadcast waits for the wallet's own answer.

const ops = [['transfer', { from: 'alice', to: 'bob', amount: '1.000 HIVE', memo: '' }]] as never;

function slowWallet(answerAfterMs: number) {
  return {
    requestHandshake: (cb: () => void) => cb(),
    requestBroadcast: (_a: string, _o: unknown, _t: string, cb: (r: unknown) => void) => {
      setTimeout(() => cb({ success: true, result: { id: 'tx1' } }), answerAfterMs);
    },
  };
}

const store = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

describe('extension broadcast deadline', () => {
  it('waits for a wallet that answers after 45 seconds', async () => {
    (globalThis as { window?: unknown }).window = { hive_keychain: slowWallet(45_000) };
    const pending = broadcastWithExtension('alice', ops, 'Active', 'keychain');
    let settled: string | null = null;
    pending.then(
      () => (settled = 'resolved'),
      (e: Error) => (settled = `rejected: ${e.message}`),
    );
    await vi.advanceTimersByTimeAsync(31_000);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(settled).toBe('resolved');
  });

  it('says a request it stops waiting for may still be open in the wallet', async () => {
    const pending = broadcast('alice', ops, 'Active', slowWallet(10 * 60_000) as never);
    const result = pending.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(result).resolves.toMatch(/may still be open in the wallet/i);
  });
});
