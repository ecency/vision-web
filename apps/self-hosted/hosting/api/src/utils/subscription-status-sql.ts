/**
 * The subscription status a payment leaves a tenant in, as a SQL expression
 * over its current status. A payment credits months, but it does not lift a
 * suspension: 'suspended' is an operator decision (services/subscription.ts),
 * so a suspended tenant stays suspended with its term extended.
 */
export const ACTIVATED_STATUS_SQL =
  "CASE WHEN subscription_status = 'suspended' THEN 'suspended' ELSE 'active' END";
