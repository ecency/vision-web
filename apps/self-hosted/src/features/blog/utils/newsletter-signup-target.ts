/**
 * The pure half of the newsletter signup form (vision-web#1537): whether this
 * instance offers it and what a submission subscribes to. Kept out of the
 * component so the rules are testable in the node test environment.
 *
 * Managed instances only: the form renders only when the served config carries
 * `managed` (never a true self-host, never the unclaimed template), and its
 * POST goes to the host's own /api/newsletter/subscribe, a path only the
 * managed nginx forwards to ecency.com's public relay.
 */
export interface NewsletterSignupTarget {
  type: 'creator' | 'community';
  target: string;
  targetLabel: string;
}

const COMMUNITY_RE = /^hive-\d+$/i;

export function newsletterSignupTarget(cfg: {
  username?: string;
  managed?: boolean;
  template?: boolean;
  enabled?: boolean;
  siteTitle?: string;
}): NewsletterSignupTarget | null {
  if (cfg.managed !== true || cfg.template === true || cfg.enabled === false || !cfg.username) return null;
  const target = cfg.username.toLowerCase();
  const isCommunity = COMMUNITY_RE.test(target);
  return {
    type: isCommunity ? 'community' : 'creator',
    target,
    targetLabel: cfg.siteTitle?.trim() || (isCommunity ? target : `@${target}`),
  };
}

export interface NewsletterSubscribeBody {
  email: string;
  type: 'creator' | 'community';
  target: string;
  cadence: 'weekly' | 'monthly';
  source: 'self-hosted-blog';
  /**
   * Cloudflare Turnstile token. The relay requires one from every caller without an
   * account, and a reader on a blog never has one, so it is required here in practice.
   */
  captchaToken: string;
}

/**
 * The body the form posts, exactly as the relay expects it.
 *
 * `targetLabel` is deliberately NOT sent any more. It used to carry the site title into
 * the confirmation email, which meant a caller chose part of a sentence in mail our domain
 * sends to an address they picked; the service derives the label from the target itself
 * now. `NewsletterSignupTarget.targetLabel` still exists and is still used, for the copy
 * this app renders itself.
 */
export function newsletterSubscribeBody(
  t: NewsletterSignupTarget,
  email: string,
  cadence: 'weekly' | 'monthly',
  captchaToken: string
): NewsletterSubscribeBody {
  return {
    email: email.trim(),
    type: t.type,
    target: t.target,
    cadence,
    source: 'self-hosted-blog',
    captchaToken,
  };
}

/**
 * Whether the sidebar should carry the signup form on this path. One form per
 * page: the About page renders its own in the content column (vision-web#1551),
 * which is the only surface every template has, so the rail stands down there.
 *
 * Decided by route rather than by theme on purpose. Whether the rail is
 * rendered at all is each template's own choice (four of the nine never render
 * it), so a theme-based rule would have to track every template's structure,
 * while this one holds for all of them.
 */
export function sidebarShowsNewsletter(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') !== '/about';
}
