/**
 * Names no tenant may take. A tenant's config is written as
 * configs/<username>.json, and nginx serves configs/default.json to every
 * subdomain without a tenant, so a tenant called "default" would collide with
 * that fallback. Extend the list when another file or path joins it.
 */
const RESERVED = new Set(['default']);

export function isReservedTenantName(username: string): boolean {
  return RESERVED.has(username.toLowerCase());
}
