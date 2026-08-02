/**
 * Payment Routes
 */

import { Hono } from 'hono';
import { internalSecret } from './internal';
import { db } from '../db/client';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { TenantService } from '../services/tenant-service';
import {
  PAYMENT_ACCOUNT,
  MONTHLY_PRICE_HBD,
  CUSTOM_DOMAIN_MONTHLY_PRICE_HBD,
  CUSTOM_DOMAIN_UPGRADE_DELTA_HBD,
  remainingMonths,
  customDomainUpgradeHbd,
  hbd,
} from '../pricing';

export const paymentRoutes = new Hono();

// GET /v1/payments/methods - which rails are available + pricing (for the signup UI)
paymentRoutes.get('/methods', async (c) => {
  const monthlyHbd = hbd(MONTHLY_PRICE_HBD);
  const facilitator = process.env.X402_FACILITATOR_URL || '';
  // Card requires the internal secret (ePoints -> hosting activation). Without it, a paid
  // card order can only get a 403 from /v1/internal/activate, so never advertise the option.
  // Asked through internalSecret() rather than by re-testing the variable, so that a secret
  // the activation endpoint refuses is also one the signup UI does not offer: a value that
  // is present but too weak would otherwise take the payment and fail the fulfilment.
  const cardEnabled =
    (process.env.HOSTING_CARD_ENABLED || 'true') === 'true' && internalSecret() !== null;
  return c.json({
    hbd: {
      enabled: true,
      monthly: monthlyHbd,
      account: PAYMENT_ACCOUNT,
    },
    x402: {
      enabled: facilitator.startsWith('https://'),
      monthly: monthlyHbd,
    },
    // Card is fulfilled through the central ePoints Stripe rail (checkout happens on
    // the web via the shared Elements flow); this flag only tells the UI whether to
    // offer the option.
    card: {
      enabled: cardEnabled,
      monthlyUsdCents: parseInt(process.env.HOSTING_CARD_USD_CENTS || '200', 10),
    },
  });
});

// GET /v1/payments - Get payment history for authenticated user
paymentRoutes.get('/', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const username = authUser.username;

  const tenant = await db.queryOne<{ id: string }>(
    'SELECT id FROM tenants WHERE username = $1',
    [username]
  );

  if (!tenant) {
    return c.json({ payments: [] });
  }

  const payments = await db.queryAll(
    `SELECT
       id, trx_id, block_num, from_account, amount, currency,
       memo, status, months_credited, subscription_extended_to, created_at
     FROM payments
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [tenant.id]
  );

  return c.json({ payments });
});

// GET /v1/payments/instructions/:username - Get payment instructions
paymentRoutes.get('/instructions/:username', async (c) => {
  const username = c.req.param('username');
  const months = parseInt(c.req.query('months') || '1', 10);
  // ?domain=1 quotes the one-step custom-domain (pro) tier: higher monthly price and a ':domain'
  // memo that activates the blog AND unlocks custom domains in a single HBD transfer.
  const domain = c.req.query('domain') === '1' || c.req.query('domain') === 'true';

  const paymentAccount = PAYMENT_ACCOUNT;
  const monthlyPrice = domain ? CUSTOM_DOMAIN_MONTHLY_PRICE_HBD : MONTHLY_PRICE_HBD;
  const totalAmount = (monthlyPrice * months).toFixed(3);
  // blog:name / blog:name:months, with a trailing :domain for the custom-domain tier.
  const memo = `blog:${username}${months > 1 ? ':' + months : ''}${domain ? ':domain' : ''}`;

  return c.json({
    to: paymentAccount,
    amount: totalAmount + ' HBD',
    memo,
    monthlyPrice: hbd(monthlyPrice) + ' HBD',
    months,
    totalAmount: totalAmount + ' HBD',
    customDomain: domain,
    instructions: [
      `Send ${totalAmount} HBD to @${paymentAccount}`,
      `Use memo: ${memo}`,
      'Your blog will be activated within seconds of payment confirmation',
    ],
  });
});

// GET /v1/payments/upgrade-quote/:username - Prorated cost to add a custom domain (upgrade an
// existing ACTIVE standard tenant to the Pro tier) for the months remaining on its current term.
// Public read (no secrets): only quotes an amount + the upgrade memo; the on-chain payment and the
// listener re-validate. `eligible: false` when the tenant is missing, not active, or already Pro.
paymentRoutes.get('/upgrade-quote/:username', async (c) => {
  const username = c.req.param('username');
  const tenant = await TenantService.getByUsername(username);

  if (!tenant || tenant.subscriptionStatus !== 'active') {
    return c.json({ eligible: false, reason: 'not_active' });
  }
  if (tenant.subscriptionPlan === 'pro') {
    return c.json({ eligible: false, reason: 'already_pro' });
  }

  const now = new Date();
  const months = remainingMonths(tenant.subscriptionExpiresAt, now);
  // Expiry has passed (but the hourly expire sweep hasn't flipped status yet): there is no term to
  // prorate against, so quoting eligible would produce a 0.000 HBD upgrade the UI can't pay. Report
  // ineligible so the owner renews first.
  if (months < 1) {
    return c.json({ eligible: false, reason: 'expired' });
  }
  const amount = customDomainUpgradeHbd(tenant.subscriptionExpiresAt, now);

  return c.json({
    eligible: true,
    to: PAYMENT_ACCOUNT,
    amount: hbd(amount) + ' HBD',
    memo: `upgrade:${username.toLowerCase()}`,
    remainingMonths: months,
    perMonth: hbd(CUSTOM_DOMAIN_UPGRADE_DELTA_HBD) + ' HBD',
    expiresAt: tenant.subscriptionExpiresAt,
  });
});

// GET /v1/payments/verify/:trxId - Check if a specific transaction was processed
paymentRoutes.get('/verify/:trxId', async (c) => {
  const trxId = c.req.param('trxId');

  const payment = await db.queryOne(
    `SELECT
       id, trx_id, status, months_credited, subscription_extended_to, created_at
     FROM payments
     WHERE trx_id = $1`,
    [trxId]
  );

  if (!payment) {
    return c.json({
      found: false,
      message: 'Transaction not found. It may take a few seconds to process.',
    });
  }

  return c.json({
    found: true,
    status: payment.status,
    monthsCredited: payment.months_credited,
    subscriptionExtendedTo: payment.subscription_extended_to,
  });
});

// GET /v1/payments/stats - Admin stats (requires admin auth)
paymentRoutes.get('/stats', authMiddleware, adminMiddleware, async (c) => {
  // Amounts are split by currency: HBD (on-chain) and USD (card) must never be summed
  // together, or revenue totals mix two units.
  const stats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'processed') as total_payments,
      SUM(amount) FILTER (WHERE status = 'processed' AND currency = 'HBD') as total_hbd,
      SUM(amount) FILTER (WHERE status = 'processed' AND currency = 'USD') as total_usd,
      SUM(months_credited) FILTER (WHERE status = 'processed') as total_months,
      COUNT(DISTINCT tenant_id) FILTER (WHERE status = 'processed') as unique_tenants,
      COUNT(*) FILTER (WHERE status = 'processed' AND created_at > NOW() - INTERVAL '30 days') as payments_30d,
      SUM(amount) FILTER (WHERE status = 'processed' AND currency = 'HBD' AND created_at > NOW() - INTERVAL '30 days') as hbd_30d,
      SUM(amount) FILTER (WHERE status = 'processed' AND currency = 'USD' AND created_at > NOW() - INTERVAL '30 days') as usd_30d
    FROM payments
  `);

  const activeSubscriptions = await db.queryOne(`
    SELECT COUNT(*) as count FROM tenants WHERE subscription_status = 'active'
  `);

  return c.json({
    totalPayments: parseInt(stats.total_payments || '0'),
    totalHbd: parseFloat(stats.total_hbd || '0'),
    totalUsd: parseFloat(stats.total_usd || '0'),
    totalMonthsCredited: parseInt(stats.total_months || '0'),
    uniqueTenants: parseInt(stats.unique_tenants || '0'),
    last30Days: {
      payments: parseInt(stats.payments_30d || '0'),
      hbd: parseFloat(stats.hbd_30d || '0'),
      usd: parseFloat(stats.usd_30d || '0'),
    },
    activeSubscriptions: parseInt(activeSubscriptions?.count || '0'),
  });
});

export default paymentRoutes;
