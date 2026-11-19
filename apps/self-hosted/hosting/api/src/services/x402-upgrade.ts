import * as Pricing from '../pricing';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: any[] }>;
}

/**
 * The post-settlement step of an x402 custom-domain upgrade, run inside the route's transaction.
 *
 * The premium was priced before the payment settled. The row lock is taken here, after it, so
 * another payment (HBD or card) can have extended the term in between. The premium is priced again
 * against the locked row: if it still fits what was paid, the term moves to the custom-domain
 * plan; if it grew, the payment is kept as standard time instead, never as a cheaper upgrade of a
 * longer term and never as nothing.
 *
 * Throws tagged errors the route maps to responses: isNotFound, isInactive, isAlreadyPro,
 * isDuplicate.
 */
export async function applyX402Upgrade(
  client: Queryable,
  input: { username: string; txId: string; blockNum: number; payer: string; paid: number },
  now: Date
): Promise<{ row: any; keptAsTime: boolean }> {
  const tenantRow = await client.query(
    `SELECT id, subscription_status, subscription_plan, subscription_expires_at
       FROM tenants WHERE username = $1 FOR UPDATE`,
    [input.username.toLowerCase()]
  );
  if (!tenantRow.rowCount) {
    throw Object.assign(new Error('Tenant not found'), { isNotFound: true });
  }
  const tenant = tenantRow.rows[0];
  if (tenant.subscription_status !== 'active') {
    throw Object.assign(new Error('Subscription must be active to upgrade'), { isInactive: true });
  }
  if (tenant.subscription_plan === 'pro') {
    throw Object.assign(new Error('Already on Pro plan'), { isAlreadyPro: true });
  }

  const payment = await client.query(
    `INSERT INTO payments (id, tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited, processed_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'HBD', $6, 'processed', 0, NOW())
     ON CONFLICT (trx_id) DO NOTHING`,
    [tenant.id, input.txId, input.blockNum, input.payer, input.paid, `x402:upgrade:${input.username}`]
  );
  if (payment.rowCount === 0) {
    throw Object.assign(new Error('Payment already processed'), { isDuplicate: true });
  }

  const expiresAt = tenant.subscription_expires_at ? new Date(tenant.subscription_expires_at) : null;
  const premium = Pricing.customDomainUpgradeHbd(expiresAt, now);
  if (Math.round(premium * 1000) > Math.round(input.paid * 1000)) {
    const kept = await client.query(
      `UPDATE tenants
          SET subscription_expires_at = subscription_expires_at + ($2 * INTERVAL '1 millisecond'),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [tenant.id, Pricing.hbdAsTimeMs(input.paid, Pricing.MONTHLY_PRICE_HBD)]
    );
    return { row: kept.rows[0], keptAsTime: true };
  }

  const upgraded = await client.query(
    `UPDATE tenants
     SET subscription_plan = 'pro', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [tenant.id]
  );
  return { row: upgraded.rows[0], keptAsTime: false };
}
