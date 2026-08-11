// Thin client for the managed blog-hosting API (a separate service from vapi). CORS on
// that service already allows ecency.com. The base URL is configured per-environment; the
// signup page is hidden when it is unset.

// The managed-hosting API is a stable public service; default to it so /hosting works without
// a build-time env. Override with NEXT_PUBLIC_HOSTING_API (e.g. "" to force the coming-soon gate).
const HOSTING_API = (process.env.NEXT_PUBLIC_HOSTING_API ?? "https://api.blogs.ecency.com").replace(
  /\/$/,
  ""
);

export interface HostingPaymentMethods {
  hbd: { enabled: boolean; monthly: string; account: string };
  x402: { enabled: boolean; monthly: string };
  card: { enabled: boolean; monthlyUsdCents: number };
  /** How long an unpaid reservation (and its customized look) is held before release. */
  reservation?: { graceDays: number };
}

export interface HostingConfigInput {
  theme?: "light" | "dark" | "system";
  styleTemplate?: string;
  /** One hex color (#rgb or #rrggbb); the instance derives hover/contrast from it. */
  accent?: string;
  /** A font pairing key from the hosting API's closed set. */
  fontPreset?: string;
  title?: string;
  description?: string;
  /** Instance kind. Omit (or "blog") for a personal blog; "community" hosts a Hive community. */
  type?: "blog" | "community";
  /** The Hive community id (hive-NNNNN) when type is "community". */
  communityId?: string;
}

/** One card in the template catalog served by the hosting API (GET /v1/templates). */
export interface HostingTemplate {
  id: string;
  name: string;
  tagline: string;
  isDefault: boolean;
  colors: { background: string; surface: string; accent: string; text: string };
  headingStyle: "serif" | "sans" | "mono";
}

/**
 * Client-side mirror of the hosting API's accent validation
 * (hosting/api/src/appearance.ts). The server is authoritative; this only
 * exists so the form can refuse an unusable value before submission.
 */
export const ACCENT_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface CreateTenantResult {
  tenant: { username: string; subscriptionStatus: string; blogUrl: string };
  paymentInstructions: { to: string; amount: string; memo: string; note?: string };
}

export interface TenantInfo {
  username: string;
  owner?: string;
  subscriptionStatus: "active" | "inactive" | "expired" | "suspended" | "abandoned";
  subscriptionPlan?: "standard" | "pro";
  subscriptionExpiresAt?: string | null;
  blogUrl?: string;
}

export interface OwnedTenant {
  username: string;
  owner: string;
  type: "blog" | "community";
  subscriptionStatus: "active" | "inactive" | "expired" | "suspended";
  subscriptionPlan: "standard" | "pro";
  subscriptionExpiresAt?: string | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
  blogUrl?: string;
}

async function parseError(r: Response): Promise<string> {
  try {
    const data = await r.json();
    return (data && (data.error || data.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${HOSTING_API}${path}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${HOSTING_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json() as Promise<T>;
}

export const hostingApi = {
  /** The signup page only renders when the service URL is configured. */
  isConfigured: () => HOSTING_API.length > 0,

  paymentMethods: () => get<HostingPaymentMethods>("/v1/payments/methods"),

  /** The template catalog for the signup picker. Served by the API so the
   *  list can never drift from what tenant creation accepts. */
  templates: () => get<{ templates: HostingTemplate[] }>("/v1/templates"),

  /**
   * Create the (inactive) tenant. Payment then activates it. `username` is the tenant subdomain
   * (the Hive user for a personal blog, or the community id for a community). `owner` is the Hive
   * account that controls and pays for the instance; it defaults to `username` for a personal blog
   * where the showcased account and the owner are the same.
   */
  createTenant: (username: string, owner?: string, config?: HostingConfigInput) =>
    post<CreateTenantResult>("/v1/tenants", { username, owner: owner ?? username, config }),

  tenant: (username: string) => get<TenantInfo>(`/v1/tenants/${encodeURIComponent(username)}`),

  /** All tenants an account controls (its personal blog and any communities). */
  tenantsByOwner: (owner: string) =>
    get<{ tenants: OwnedTenant[] }>(`/v1/tenants?owner=${encodeURIComponent(owner)}`),

  /** HBD payment instructions for a given term. `domain` quotes the one-step custom-domain tier
   *  (higher price + a blog:name[:months]:domain memo that unlocks custom domains). */
  paymentInstructions: (username: string, months: number, domain = false) =>
    get<{ to: string; amount: string; memo: string; totalAmount: string; instructions: string[] }>(
      `/v1/payments/instructions/${encodeURIComponent(username)}?months=${months}${domain ? "&domain=1" : ""}`
    ),

  /** Prorated cost to add a custom domain (upgrade an existing active standard tenant to Pro) for
   *  the months remaining on its current term. `eligible: false` when not active / already Pro. */
  upgradeQuote: (username: string) =>
    get<UpgradeQuote>(`/v1/payments/upgrade-quote/${encodeURIComponent(username)}`)
};

export type UpgradeQuote =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      to: string;
      amount: string;
      memo: string;
      remainingMonths: number;
      perMonth: string;
      expiresAt: string | null;
    };

/** SKU the ePoints Stripe rail expects for a hosting term (leading number = price in cents). */
export function hostingSkuForMonths(months: number): string {
  switch (months) {
    case 3:
      return "600hosting";
    case 6:
      return "1200hosting";
    case 12:
      return "2400hosting";
    default:
      return "200hosting";
  }
}

/**
 * SKU for the Custom domain plan (hosting + your own domain) for a given term. Priced at
 * $3/mo (leading number = price in cents), which the ePoints rail activates on the internal
 * `pro` plan so custom domains unlock. Kept separate from the standard `*hosting` SKUs above.
 */
export function hostingProSkuForMonths(months: number): string {
  switch (months) {
    case 3:
      return "900prohosting";
    case 6:
      return "1800prohosting";
    case 12:
      return "3600prohosting";
    default:
      return "300prohosting";
  }
}

/** Standard hosting monthly price in USD (subdomain included). */
export const HOSTING_MONTHLY_USD = 2;
/** Custom domain plan monthly price in USD (standard + your own domain, +$1/mo). */
export const HOSTING_CUSTOM_DOMAIN_MONTHLY_USD = 3;

/** A Hive community id is the literal "hive-" followed by digits (e.g. "hive-125125"). */
export const COMMUNITY_ID_PATTERN = /^hive-\d+$/;

/** True when `id` is a well-formed Hive community id (hive-NNNNN). */
export function isValidCommunityId(id: string): boolean {
  return COMMUNITY_ID_PATTERN.test(id.trim().toLowerCase());
}
