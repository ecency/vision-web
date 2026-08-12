import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { STYLE_TEMPLATES } from '../style-templates';
import { ACCENT_HEX_PATTERN, FONT_PRESET_KEYS } from '../appearance';
import { rateLimit } from '../middleware/rate-limit';
import { COMMUNITY_NAME, TenantService } from '../services/tenant-service';

/**
 * Tools for INDEPENDENT deployments: compose the config document a
 * self-hoster's instance will serve, from the same builder the managed
 * signup uses, so a blog someone runs themselves starts from exactly the
 * look they customized on ecency.com.
 *
 * This route creates NOTHING. No tenant row, no reservation, no published
 * config file, no payment lock: it is a pure function of the request body
 * plus (for a community) one chain lookup for the title. Everything that
 * makes a blog live is deliberately absent, because the caller is
 * anonymous.
 */
export const toolsRoutes = new Hono();

/**
 * The same vocabulary the signup's create call speaks, so one customize
 * payload composes identically down either path. Kept in step with
 * createTenantSchema by sharing the rosters rather than by copying lists.
 */
const composeConfigSchema = z.object({
  username: z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]*$/),
  owner: z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]*$/).optional(),
  config: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      styleTemplate: z.enum(STYLE_TEMPLATES).optional(),
      accent: z.string().regex(ACCENT_HEX_PATTERN, 'accent must be #rgb or #rrggbb').optional(),
      fontPreset: z.enum(FONT_PRESET_KEYS).optional(),
      type: z.enum(['blog', 'community']).optional(),
      communityId: z.string().optional(),
      title: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Paths that describe a MANAGED instance and must never reach a config
 * someone else runs:
 *
 * - `managed` is the only signal an instance has that it is hosted here. On
 *   a self-hoster's domain it flips the Configuration Editor from Download
 *   to Save, and the Save calls a hosting API that is not theirs.
 * - `template` replaces the whole site with the claim landing page.
 * - `claimPreview` marks the read-only preview of an unclaimed subdomain.
 * - `hivesigner.clientId` may be Ecency's own app, which only answers to
 *   redirect URIs registered for Ecency's domains: an owner's login would
 *   fail on their own site. They register their own app (or ask us to add
 *   their address) and set it themselves.
 */
const SERVED_ONLY_PATHS: readonly (readonly string[])[] = [
  ['configuration', 'instanceConfiguration', 'managed'],
  ['configuration', 'instanceConfiguration', 'template'],
  ['configuration', 'instanceConfiguration', 'claimPreview'],
  ['configuration', 'general', 'hivesigner', 'clientId'],
];

/**
 * Drop one path. If removing the leaf empties the block that held it, that
 * block goes too: `general.hivesigner` with no clientId reads as a
 * deliberately blank app id rather than as "no Hivesigner app here". The
 * prune stops at that one level on purpose, since emptying cascades all the
 * way up would delete `general` and then `configuration` itself.
 */
function deletePath(document: Record<string, unknown>, path: readonly string[]): void {
  let parent = document;
  for (const segment of path.slice(0, -1)) {
    const next = parent[segment];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) return;
    parent = next as Record<string, unknown>;
  }
  delete parent[path[path.length - 1]];
  if (path.length < 2 || Object.keys(parent).length > 0) return;

  // The leaf's own block is now empty: remove it from ITS parent.
  let grandparent = document;
  for (const segment of path.slice(0, -2)) {
    grandparent = grandparent[segment] as Record<string, unknown>;
  }
  delete grandparent[path[path.length - 2]];
}

/** The document with every managed-only marker removed. */
export function withoutServedOnlyMarkers(document: unknown): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  for (const path of SERVED_ONLY_PATHS) {
    deletePath(copy, path);
  }
  return copy;
}

// Anonymous and unauthenticated, and each call can spend a chain lookup, so
// it carries its own budget rather than sharing the create route's.
const composeLimit = rateLimit({ name: 'tools-compose', limit: 20, windowMs: 60_000 });

toolsRoutes.post('/compose-config', composeLimit, zValidator('json', composeConfigSchema), async (c) => {
  const body = c.req.valid('json');
  const username = body.username.toLowerCase();
  // Derived exactly as the managed create path derives it: a hive-NNNN name
  // IS a community whatever the body claims. Reading only config.type let a
  // request for a community name with no type compose a blog owned by the
  // community account itself, which holds nobody's keys, so the real
  // administrator would be locked out of the editor for good.
  const isCommunity = COMMUNITY_NAME.test(username) || body.config?.type === 'community';

  // The owner rule, and the ONLY validation this route needs. Nothing here
  // is registered anywhere, so account existence and community control are
  // the deployer's business; but the owner value IS load-bearing, because
  // the instance reads it to decide who may open its editor.
  let owner: string;
  let overrides = body.config;
  if (isCommunity) {
    const communityId = (body.config?.communityId || username).toLowerCase();
    if (!COMMUNITY_NAME.test(communityId)) {
      return c.json({ error: 'Community id must look like hive-NNNN' }, 400);
    }
    // A community account holds nobody's keys, so it can never administer
    // an instance: without a separate owner, or with ANOTHER community named
    // as owner, the deployment would be permanently locked out of its own
    // Configuration Editor. The name shape decides this with no lookup.
    const requested = body.owner?.toLowerCase();
    if (!requested || requested === communityId || COMMUNITY_NAME.test(requested)) {
      return c.json({ error: 'A community instance requires a separate owner account' }, 400);
    }
    owner = requested;
    // Say so in the document too, or a community name sent without a type
    // composes a BLOG whose feed reads a keyless account and is always
    // empty. The ownership rule and the composed mode have to agree.
    overrides = { ...body.config, type: 'community', communityId };
  } else {
    // A personal blog is always controlled by its own account.
    owner = username;
  }

  const document = await TenantService.buildConfig(username, overrides, owner);
  return c.json({ config: withoutServedOnlyMarkers(document) });
});
