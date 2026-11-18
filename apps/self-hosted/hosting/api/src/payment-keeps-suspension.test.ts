import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVATED_STATUS_SQL } from './utils/subscription-status-sql';

// A payment credits months, but it does not lift an operator's suspension:
// 'suspended' is an operator decision (services/subscription.ts), so every
// payment path sets the status through ACTIVATED_STATUS_SQL, which keeps it.

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

describe('payment activation keeps an operator suspension', () => {
  it('maps suspended to suspended and anything else to active', () => {
    expect(ACTIVATED_STATUS_SQL).toBe(
      "CASE WHEN subscription_status = 'suspended' THEN 'suspended' ELSE 'active' END"
    );
  });

  it.each(['payment-listener.ts', 'routes/tenants.ts', 'routes/internal.ts'])(
    '%s sets the status through it on payment',
    (file) => {
      const source = read(file);
      expect(source).toContain('ACTIVATED_STATUS_SQL');
    }
  );

  it('the payment listener no longer sets active unconditionally', () => {
    const source = read('payment-listener.ts');
    expect(source).not.toMatch(/SET subscription_status = 'active'/);
  });
});
