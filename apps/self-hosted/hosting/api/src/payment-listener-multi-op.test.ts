import { describe, expect, it, vi } from 'vitest';

// #2128: payments are de-duplicated by Hive transaction id, so a second
// transfer to the payment account in the same transaction was dropped with no
// record. Each transfer gets its own key; the first keeps the bare trx id, so
// rows written before this change still de-duplicate a replayed block.

vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { nodes: [] }, setNodes: vi.fn() }));
vi.mock('./db/client', () => ({ db: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn() } }));

const { paymentTransfers } = await import('./payment-listener');

const t = (to: string, memo: string) => ['transfer', { from: 'payer', to, amount: '2.000 HBD', memo }];

describe('paymentTransfers', () => {
  it('gives each transfer to the payment account its own key', () => {
    const ops = [t('pay', 'blog:alice'), t('pay', 'blog:bob')];
    expect(paymentTransfers(ops as never, 'abc', 'pay').map((p) => [p.key, p.transfer.memo])).toEqual([
      ['abc', 'blog:alice'],
      ['abc:1', 'blog:bob'],
    ]);
  });

  it('keeps the bare trx id for the first payment even when other ops come before it', () => {
    const ops = [['vote', {}], t('someone', 'x'), t('pay', 'blog:alice')];
    expect(paymentTransfers(ops as never, 'abc', 'pay').map((p) => p.key)).toEqual(['abc']);
  });

  it('keeps the bare trx id for the first HBD payment when a HIVE transfer comes first', () => {
    // Before #2128 the HIVE transfer was ignored without a row and the HBD one
    // was recorded under the bare id; a replay must find that row.
    const hive = ['transfer', { from: 'payer', to: 'pay', amount: '1.000 HIVE', memo: 'x' }];
    const keys = paymentTransfers([hive, t('pay', 'a')] as any, 'trx', 'pay').map((p) => p.key);
    expect(keys).toEqual(['trx:0', 'trx']);
  });

  it('ignores transfers to other accounts', () => {
    expect(paymentTransfers([t('other', 'blog:x')] as never, 'abc', 'pay')).toEqual([]);
  });
});
