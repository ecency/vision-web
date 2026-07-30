import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Internal links must resolve to a route the router declares.
 *
 * The SPA serves index.html for unmatched paths, so a link to a route that does
 * not exist renders "Page not found" with HTTP 200. It never appears as a 404 in
 * logs, and nothing in the type system catches it because these are raw `href`
 * strings rather than typed `<Link to>`. A commenter's name pointed at `/@user`
 * this way and shipped.
 *
 * Scope, stated precisely rather than as "every link":
 *   1. literal values        - `href="/blog"`, `` href={`/@${a}/${b}`} ``  -> checked
 *   2. same-file identifiers - `href={entryLink}` where entryLink is a const
 *                              or useMemo returning a literal              -> resolved, then checked
 *   3. anything else dynamic - config values, API-derived URLs, and props
 *                              that merely share the name `to`             -> must appear in
 *                              DYNAMIC_LINKS with a reason
 *
 * (3) exists so the blind spot is visible: a new unresolvable link fails this
 * test until someone classifies it, instead of silently escaping the check.
 *
 * Lives under src/routes with a `-` prefix, TanStack Router's convention for a
 * non-route file in the routes directory. Without it the generator warns on
 * every build that this file exports no Route.
 */

const SRC = join(__dirname, '..');

/**
 * Dynamic `href` / `to` values this test cannot resolve statically.
 * Adding an entry is a deliberate act: say why it is safe.
 */
const DYNAMIC_LINKS: Record<string, string> = {
  SIGNUP_URL: 'absolute https://ecency.com/hosting constant',
  claimHref: 'built from HOSTING_URL, absolute',
  rssUrl: 'getRssFeedUrl() returns an absolute ecency.com URL',
  createPostUrl: 'runtime config general.createPostUrl, may be internal or absolute',
  websiteUrl: 'account metadata, arbitrary external site',
  'link.url': 'wallet/extension install links, external',
  to: 'not a link: TippingStepCurrency prop naming the tip recipient',
  recipientUsername: 'not a link: TippingPopover prop naming the tip recipient',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.tsx') ? [p] : [];
  });
}

/** Route paths declared by the generated route tree, e.g. /$author/$permlink. */
function declaredRoutes(): string[] {
  const tree = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8');
  return [...new Set(Array.from(tree.matchAll(/'(\/[^']*)'/g), (m) => m[1]))];
}

const LINK_RE =
  /\b(?:href|to)=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|\{([A-Za-z_$][\w$.]*)\})/g;

/** First string literal assigned to `name` in this file, if it is a simple const. */
function resolveIdentifier(source: string, name: string): string | null {
  const root = name.split('.')[0];
  const at = source.search(new RegExp(`\\bconst\\s+${root}\\s*=`));
  if (at === -1) return null;
  const window = source.slice(at, at + 400).replace(/\/\/[^\n]*/g, '');
  const lit = window.match(/[`'"]([^`'"]*)[`'"]/);
  return lit ? lit[1] : null;
}

const isInternal = (v: string) => v.startsWith('/') && !v.startsWith('//');

/** `/@${a}/${b}` -> ['@*', '*'] so interpolations compare as wildcards. */
function segments(path: string): string[] {
  const clean = path.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, '*');
  return clean.split('/').filter(Boolean);
}

function matches(link: string, route: string): boolean {
  const l = segments(link);
  const r = segments(route);
  if (l.length !== r.length) return false;
  return r.every((rs, i) => rs.startsWith('$') || rs === l[i]);
}

interface FoundLink {
  where: string;
  value: string;
  via?: string;
}

function collect() {
  const checked: FoundLink[] = [];
  const unresolved: FoundLink[] = [];

  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8');
    const rel = file.replace(SRC, 'src');

    for (const m of source.matchAll(LINK_RE)) {
      const line = source.slice(0, m.index).split('\n').length;
      const where = `${rel}:${line}`;
      const literal = m[1] ?? m[2] ?? m[3];

      if (literal !== undefined) {
        if (isInternal(literal)) checked.push({ where, value: literal });
        continue;
      }

      const ident = m[4];
      if (ident in DYNAMIC_LINKS) continue; // classified, see the map above

      const resolved = resolveIdentifier(source, ident);
      if (resolved === null) {
        unresolved.push({ where, value: ident });
      } else if (isInternal(resolved)) {
        checked.push({ where, value: resolved, via: ident });
      }
    }
  }
  return { checked, unresolved };
}

describe('internal links resolve to declared routes', () => {
  const routes = declaredRoutes();
  const { checked, unresolved } = collect();

  it('finds the route tree and links to check', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(checked.length).toBeGreaterThan(0);
  });

  it('resolves identifier-backed links, not only inline literals', () => {
    // blog-discussion-item's `href={entryLink}` is a useMemo returning a template
    // literal; an inline-literal-only scan would not see it at all.
    const viaIdentifier = checked.filter((l) => l.via);
    expect(viaIdentifier.length).toBeGreaterThan(0);
    expect(viaIdentifier.some((l) => l.via === 'entryLink')).toBe(true);
  });

  it('has no link pointing at an undeclared route', () => {
    const dead = checked
      .filter((l) => !routes.some((route) => matches(l.value, route)))
      .map((l) => `${l.where} -> ${l.value}${l.via ? ` (via ${l.via})` : ''}`);
    expect(dead).toEqual([]);
  });

  it('leaves no dynamic link unclassified', () => {
    const missing = unresolved.map((l) => `${l.where} -> ${l.value}`);
    expect(missing).toEqual([]);
  });

  it('recognises the shapes the app actually uses', () => {
    // guards the matcher itself, so a broken matcher cannot silently pass the above
    expect(matches('/blog', '/blog')).toBe(true);
    expect(matches('/@${a}/${b}', '/$author/$permlink')).toBe(true);
    expect(matches('/edit/$author/$permlink', '/edit/$author/$permlink')).toBe(true);
    expect(matches('/blog', '/$author/$permlink')).toBe(false);
    expect(isInternal('//evil.com')).toBe(false);
    // the regression this test exists for
    expect(routes.some((r) => matches('/@${author}', r))).toBe(false);
  });
});
