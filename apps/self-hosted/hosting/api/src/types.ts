/**
 * Ecency Hosting API - Type Definitions
 */

import type { StyleTemplate } from './style-templates';

// =============================================================================
// Tenant Types
// =============================================================================

export interface Tenant {
  id: string;
  username: string; // Showcased Hive account, also used as subdomain (hive-NNNNN for a community)
  owner: string; // Hive account that created and controls this instance (equals username for a personal blog)

  // Subscription. 'abandoned' = an unpaid reservation the sweep reclaimed after the grace
  // window; the row is kept (not deleted) so an in-flight payment can still revive it in place,
  // and the username reads as available again for a fresh reservation.
  subscriptionStatus: 'inactive' | 'active' | 'expired' | 'suspended' | 'abandoned';
  subscriptionPlan: 'standard' | 'pro';
  subscriptionStartedAt: Date | null;
  subscriptionExpiresAt: Date | null;
  
  // Custom domain (Pro only)
  customDomain: string | null;
  customDomainVerified: boolean;
  customDomainVerifiedAt: Date | null;
  
  // Blog configuration
  config: BlogConfig;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface BlogConfig {
  version: number;
  configuration: {
    general: {
      theme: 'light' | 'dark' | 'system';
      styleTemplate: StyleTemplate;
      language: string;
      imageProxy: string;
      profileBaseUrl: string;
      createPostUrl: string;
      styles?: {
        background?: string;
      };
    };
    instanceConfiguration: {
      type: 'blog' | 'community';
      username: string;
      /** Controlling Hive account; the SPA's ownership gate reads it. */
      owner?: string;
      /** Injected into SERVED config files only (never stored): instance is on managed hosting. */
      managed?: boolean;
      communityId?: string;
      meta: {
        title: string;
        description: string;
        logo?: string;
        favicon?: string;
        keywords?: string;
      };
      layout: {
        listType: 'list' | 'grid';
        sidebar: {
          placement: 'left' | 'right';
          followers?: { enabled: boolean };
          following?: { enabled: boolean };
          hiveInformation?: { enabled: boolean };
        };
      };
      features: {
        /**
         * How much of the Hive blockchain the site shows readers. Decorative
         * here, like the rest of this interface: nothing validates against it,
         * and the client resolver treats every member as unknown-shaped.
         */
        hive?: {
          readerLayer?: string;
          authorRewards?: string;
          payoutLabel?: string;
          learnMoreUrl?: string;
        };
        postsFilters?: string[];
        likes?: { enabled: boolean };
        comments?: { enabled: boolean };
        post?: { text2Speech?: { enabled: boolean } };
        auth?: {
          enabled: boolean;
          methods: ('keychain' | 'hivesigner' | 'hiveauth')[];
        };
      };
    };
  };
}

// Database row type (snake_case) for Tenant
export interface TenantRow {
  id: string;
  username: string;
  owner: string;
  subscription_status: 'inactive' | 'active' | 'expired' | 'suspended' | 'abandoned';
  subscription_plan: 'standard' | 'pro';
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  custom_domain_verified_at: string | null;
  config: any; // JSON from DB
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row (snake_case) to Tenant (camelCase)
 */
export function mapTenantFromDb(row: TenantRow): Tenant {
  return {
    id: row.id,
    username: row.username,
    owner: row.owner,
    subscriptionStatus: row.subscription_status,
    subscriptionPlan: row.subscription_plan,
    subscriptionStartedAt: row.subscription_started_at ? new Date(row.subscription_started_at) : null,
    subscriptionExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at) : null,
    customDomain: row.custom_domain,
    customDomainVerified: row.custom_domain_verified,
    customDomainVerifiedAt: row.custom_domain_verified_at ? new Date(row.custom_domain_verified_at) : null,
    config: row.config,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert Tenant (camelCase) to database fields (snake_case)
 * For use in INSERT/UPDATE queries - only includes fields that are set
 */
export function mapTenantToDb(tenant: Partial<Tenant>): Record<string, any> {
  const result: Record<string, any> = {};

  if (tenant.username !== undefined) result.username = tenant.username;
  if (tenant.owner !== undefined) result.owner = tenant.owner;
  if (tenant.subscriptionStatus !== undefined) result.subscription_status = tenant.subscriptionStatus;
  if (tenant.subscriptionPlan !== undefined) result.subscription_plan = tenant.subscriptionPlan;
  if (tenant.subscriptionStartedAt !== undefined) result.subscription_started_at = tenant.subscriptionStartedAt;
  if (tenant.subscriptionExpiresAt !== undefined) result.subscription_expires_at = tenant.subscriptionExpiresAt;
  if (tenant.customDomain !== undefined) result.custom_domain = tenant.customDomain;
  if (tenant.customDomainVerified !== undefined) result.custom_domain_verified = tenant.customDomainVerified;
  if (tenant.customDomainVerifiedAt !== undefined) result.custom_domain_verified_at = tenant.customDomainVerifiedAt;
  if (tenant.config !== undefined) result.config = JSON.stringify(tenant.config);

  return result;
}

// =============================================================================
// Payment Types
// =============================================================================

export interface Payment {
  id: string;
  tenantId: string;
  
  // Hive transaction
  trxId: string;
  blockNum: number;
  fromAccount: string;
  amount: number;
  currency: 'HBD' | 'HIVE';
  memo: string | null;
  
  // Processing
  status: 'pending' | 'processed' | 'failed' | 'refunded';
  processedAt: Date | null;
  
  // Subscription extension
  monthsCredited: number;
  subscriptionExtendedTo: Date | null;
  
  createdAt: Date;
}

export interface HiveTransfer {
  trx_id: string;
  block_num: number;
  from: string;
  to: string;
  amount: string; // "1.000 HBD"
  memo: string;
  timestamp: string;
}

// =============================================================================
// Domain Verification Types
// =============================================================================

export interface DomainVerification {
  id: string;
  tenantId: string;
  domain: string;
  verificationToken: string;
  verificationMethod: 'cname' | 'txt';
  verified: boolean;
  verifiedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

// Database row type (snake_case)
export interface DomainVerificationRow {
  id: string;
  tenant_id: string;
  domain: string;
  verification_token: string;
  verification_method: 'cname' | 'txt';
  verified: boolean;
  verified_at: string | null;
  expires_at: string;
  created_at: string;
}

/**
 * Convert database row (snake_case) to DomainVerification (camelCase)
 */
export function mapDomainVerificationFromDb(row: DomainVerificationRow): DomainVerification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    verificationToken: row.verification_token,
    verificationMethod: row.verification_method,
    verified: row.verified,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

/**
 * Convert DomainVerification (camelCase) to database fields (snake_case)
 * For use in INSERT/UPDATE queries
 */
export function mapDomainVerificationToDb(verification: Partial<DomainVerification>): Record<string, any> {
  const result: Record<string, any> = {};

  if (verification.tenantId !== undefined) result.tenant_id = verification.tenantId;
  if (verification.domain !== undefined) result.domain = verification.domain;
  if (verification.verificationToken !== undefined) result.verification_token = verification.verificationToken;
  if (verification.verificationMethod !== undefined) result.verification_method = verification.verificationMethod;
  if (verification.verified !== undefined) result.verified = verification.verified;
  if (verification.verifiedAt !== undefined) result.verified_at = verification.verifiedAt;
  if (verification.expiresAt !== undefined) result.expires_at = verification.expiresAt;

  return result;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

// POST /v1/tenants - Create new tenant
export interface CreateTenantRequest {
  username: string;
  config?: Partial<BlogConfig>;
}

export interface CreateTenantResponse {
  tenant: Tenant;
  paymentInstructions: {
    to: string;
    amount: string;
    memo: string;
  };
}

// PATCH /v1/tenants/:username - Update tenant config
export interface UpdateTenantRequest {
  config?: Partial<BlogConfig>;
  customDomain?: string;
}

// GET /v1/tenants/:username/status
export interface TenantStatusResponse {
  exists: boolean;
  username?: string;
  subscriptionStatus: string;
  subscriptionPlan?: string;
  daysRemaining?: number | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
  blogUrl?: string;
}

// POST /v1/domains/verify - Initiate domain verification
export interface VerifyDomainRequest {
  domain: string;
}

export interface VerifyDomainResponse {
  domain: string;
  verificationMethod: 'cname' | 'txt';
  verificationToken: string;
  instructions: string;
  expiresAt: Date;
}

// GET /v1/auth/tenant-lookup - Traefik middleware for custom domain lookup
export interface TenantLookupResponse {
  tenantId: string;
  username: string;
}

// =============================================================================
// Payment Memo Format
// =============================================================================

/**
 * Payment memo format:
 * - "blog:username" - Pay for username's blog
 * - "blog:username:months" - Pay for specific months (e.g., "blog:alice:12")
 * - "upgrade:username" - Upgrade to Pro plan
 * 
 * Examples:
 * - "blog:alice" - 1 month standard for alice
 * - "blog:bob:6" - 6 months standard for bob
 * - "upgrade:alice" - Upgrade alice to Pro
 */
export interface ParsedMemo {
  action: 'blog' | 'upgrade' | 'unknown';
  username: string;
  months: number;
  // A trailing ':domain' on a blog memo enables the custom-domain tier (internally the 'pro'
  // subscription_plan) in one payment, at the higher custom-domain monthly price. Named 'domain'
  // (never 'pro') so it can't be confused with — or become a backdoor to — the separate account-
  // level Ecency Pro membership, which this hosting rail has no connection to.
  customDomain: boolean;
}

export function parseMemo(memo: string): ParsedMemo {
  const parts = memo.trim().toLowerCase().split(':');

  // Trim username and validate it's not empty/whitespace-only
  const username = parts[1]?.trim() || '';

  if (parts[0] === 'blog' && username !== '') {
    // Segments after the username, trimmed. An optional trailing ':domain' turns on the
    // custom-domain tier; it may appear as blog:name:domain (1 month) or blog:name:<months>:domain.
    let rest = parts.slice(2).map((p) => p.trim()).filter((p) => p !== '');
    let customDomain = false;
    if (rest[rest.length - 1] === 'domain') {
      customDomain = true;
      rest = rest.slice(0, -1);
    }
    const monthsStr = rest[0] || '1';
    const parsed = parseInt(monthsStr, 10);
    const months = parsed > 0 ? parsed : 1;
    return {
      action: 'blog',
      username,
      months,
      customDomain,
    };
  }

  if (parts[0] === 'upgrade' && username !== '') {
    return {
      action: 'upgrade',
      username,
      months: 1,
      customDomain: false,
    };
  }

  return {
    action: 'unknown',
    username: '',
    months: 0,
    customDomain: false,
  };
}
