/**
 * x402 Paywall Middleware Configuration
 *
 * Pre-configured paywall instances for subscription and upgrade flows.
 */

import type { Context, Next } from 'hono';
import { honoPaywall } from '@hiveio/x402/middleware/hono';
import { PAYMENT_ACCOUNT, MONTHLY_PRICE_HBD, hbd } from '../pricing';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'http://localhost:4020';

/**
 * Paywall for new subscriptions (1 HBD default)
 */
export const subscriptionPaywall = honoPaywall({
  amount: `${hbd(MONTHLY_PRICE_HBD)} HBD`,
  receivingAccount: PAYMENT_ACCOUNT,
  facilitatorUrl: FACILITATOR_URL,
  description: 'Ecency Blog hosting - 1 month subscription',
});

/**
 * Paywall for the custom-domain (Pro) upgrade of a running term. The price is the premium for the
 * months left on that term (customDomainUpgradeHbd), which the route computes for the tenant and
 * sets as `upgradePremium` before this runs: the same amount an HBD upgrade pays. Built per
 * request because the amount depends on the tenant. With no premium set (no term left, or a route
 * that did not price it) no payment is taken.
 */
export const proUpgradePaywall = async (c: Context, next: Next) => {
  const premium: number | undefined = c.get('upgradePremium');
  if (typeof premium !== 'number' || !(premium > 0)) {
    return c.json({ error: 'No remaining term to upgrade' }, 400);
  }
  return honoPaywall({
    amount: `${hbd(premium)} HBD`,
    receivingAccount: PAYMENT_ACCOUNT,
    facilitatorUrl: FACILITATOR_URL,
    description: 'Ecency Blog hosting - custom domain for the rest of the current term',
  })(c, next);
};
