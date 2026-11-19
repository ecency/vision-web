/**
 * Auth Middleware
 *
 * Validates Bearer tokens for protected routes using secure JWT verification
 */

import type { Context, Next } from 'hono';
import { verifyToken, type AuthUser } from '../utils/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    payer: string;
    txId: string;
    blockNum: number;
    /** Tenant config prebuilt BEFORE a paywall settles (see /subscribe). */
    tenantConfig: any;
    /** HBD premium for the months left, priced before the upgrade paywall (see /:username/upgrade). */
    upgradePremium: number;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization required' }, 401);
  }

  const token = authHeader.slice(7);
  const user = verifyToken(token);

  if (!user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', user);
  await next();
}

/**
 * Admin middleware - validates user is an admin
 * Call after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Check if user is admin (defined in environment variable)
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map((u) => u.trim().toLowerCase());

  if (!adminUsers.includes(user.username.toLowerCase())) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
}
