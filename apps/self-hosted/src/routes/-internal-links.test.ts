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
 *
 * Keyed by `file:identifier`, never by identifier alone. `to` in particular is a
 * very common name (it is also a plain prop on the tipping components), so a
 * bare-name exemption would silently wave through a real `<a href={to}>` added
 * anywhere in the app later.
 *
 * `occurrences` pins how many matches the entry is allowed to absorb in that
 * file. Keying by file alone still covers every same-named occurrence in it, so
 * adding a real `<a href={to}>` beside the tipping prop would inherit its
 * exemption; the count turns that into a failure instead.
 */
const DYNAMIC_LINKS: Record<string, { occurrences: number; reason: string }> = {
  'src/routes/hosting.tsx:SIGNUP_URL': {
    occurrences: 1,
    reason: 'absolute https://ecency.com/hosting constant',
  },
  'src/features/claim/claim-landing.tsx:claimHref': {
    occurrences: 1,
    reason: 'built from HOSTING_URL, absolute',
  },
  'src/features/blog/layout/blog-navigation.tsx:rssUrl': {
    occurrences: 1,
    reason: 'getRssFeedUrl() returns an absolute ecency.com URL',
  },
  'src/features/auth/components/create-post-button.tsx:createPostUrl': {
    occurrences: 1,
    reason: 'runtime config general.createPostUrl, may be internal or absolute',
  },
  'src/features/blog/layout/blog-sidebar.tsx:websiteUrl': {
    occurrences: 1,
    reason: 'account metadata, arbitrary external site',
  },
  'src/features/auth/components/extension-login.tsx:link.url': {
    occurrences: 1,
    reason: 'wallet/extension install links, external',
  },
  'src/features/tipping/components/tipping-popover.tsx:to': {
    occurrences: 1,
    reason: 'not a link: TippingStepCurrency prop naming the tip recipient',
  },
  'src/features/tipping/components/tip-button.tsx:recipientUsername': {
    occurrences: 1,
    reason: 'not a link: TippingPopover prop naming the tip recipient',
  },
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

/**
 * The literal assigned to `name`, for the two forms the app actually uses:
 *
 *   const NAME = '/literal'
 *   const NAME = useMemo(() => `/literal`, [deps])   (comments before the arrow ok)
 *
 * Anything else returns null and becomes an unclassified link, which fails the
 * suite. Deliberately strict: an earlier version scanned for the first string
 * within 400 characters of the declaration, which for `const target = getUrl()`
 * happily returned a className or even a word from a type annotation. A wrong
 * literal that does not start with "/" is treated as external and the real link
 * is dropped from the check without a sound, which is the worst outcome for a
 * test whose whole job is to not miss links.
 *
 * Resolution is positional: the declaration nearest *above* the link wins. Two
 * component scopes in one file can reuse a name, and preferring one syntactic
 * form globally would let a later `useMemo(() => 'https://external')` answer for
 * an earlier `const target = '/missing'`, reclassifying a real internal link as
 * external. This is not scope analysis (that wants an AST), but nearest
 * preceding declaration matches how these components are actually written.
 */
function declarationsOf(
  source: string,
  name: string,
): { at: number; value: string | null }[] {
  const root = name.split('.')[0].replace(/[^\w$]/g, '');
  if (!root) return [];

  // Every `const NAME =`, whatever the right-hand side. Collecting only the
  // shapes we can read would let an unreadable declaration be skipped over, so
  // a later `const target = getUrl()` would silently inherit an earlier
  // component's `const target = '/blog'`.
  const anyDecl = new RegExp(`\\bconst\\s+${root}\\s*=`, 'g');
  const direct = new RegExp(`^const\\s+${root}\\s*=\\s*(['"\`])([^'"\`]*)\\1`);
  const viaMemo = new RegExp(
    `^const\\s+${root}\\s*=\\s*useMemo\\(\\s*(?:\\/\\/[^\\n]*\\n\\s*)*\\(\\s*\\)\\s*=>\\s*(['"\`])([^'"\`]*)\\1`,
  );

  return Array.from(source.matchAll(anyDecl), (m) => {
    const tail = source.slice(m.index);
    const lit = tail.match(viaMemo) ?? tail.match(direct);
    return { at: m.index, value: lit ? lit[2] : null };
  });
}

/**
 * Nearest declaration above `usedAt`, resolved only if that declaration itself
 * has a readable literal. An unreadable one yields null, i.e. unclassified,
 * rather than deferring to some other declaration of the same name.
 */
function resolveIdentifier(
  source: string,
  name: string,
  usedAt: number,
): string | null {
  const above = declarationsOf(source, name).filter((d) => d.at < usedAt);
  return above.length > 0 ? above[above.length - 1].value : null;
}

/**
 * Builds the literal text `${name}` for fixtures, without writing `${` inside a
 * plain string. Biome's noTemplateCurlyInString flags that, correctly in general
 * (it usually means a missing backtick), and here the placeholder text is the
 * thing under test rather than a mistake.
 */
const ph = (name: string) => `$\u007B${name}\u007D`;

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
  const exemptionHits: Record<string, number> = {};

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
      // Scoped to this file: a same-named identifier elsewhere is not exempt.
      const key = `${rel}:${ident}`;
      if (key in DYNAMIC_LINKS) {
        exemptionHits[key] = (exemptionHits[key] ?? 0) + 1;
        continue;
      }

      const resolved = resolveIdentifier(source, ident, m.index);
      if (resolved === null) {
        unresolved.push({ where, value: ident });
      } else if (isInternal(resolved)) {
        checked.push({ where, value: resolved, via: ident });
      }
    }
  }
  return { checked, unresolved, exemptionHits };
}

describe('internal links resolve to declared routes', () => {
  const routes = declaredRoutes();
  const { checked, unresolved, exemptionHits } = collect();

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

  it('consumes each exemption exactly as many times as declared', () => {
    // File-scoped keys still cover every same-named occurrence in that file, so
    // a real <a href={to}> added beside the tipping prop would inherit its
    // exemption. Pinning the count makes that a failure. A stale entry that
    // matches nothing fails here too.
    const expected = Object.fromEntries(
      Object.entries(DYNAMIC_LINKS).map(([k, v]) => [k, v.occurrences]),
    );
    expect(exemptionHits).toEqual(expected);
  });

  it('scopes every exemption to a file, so common names stay checked', () => {
    // A bare `to` key would exempt any future `<a href={to}>` in any file.
    for (const [key, entry] of Object.entries(DYNAMIC_LINKS)) {
      expect(key).toMatch(/^src\/.+\.tsx:[\w$.]+$/);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
    // and each exemption must still point at a file that exists
    for (const key of Object.keys(DYNAMIC_LINKS)) {
      const file = join(SRC, '..', key.split(':')[0]);
      expect(() => readFileSync(file, 'utf8')).not.toThrow();
    }
  });

  it('resolves only real literal assignments, never a nearby string', () => {
    const interpolated = `/@${ph('a')}/${ph('b')}`;
    const memo = `const entryLink = useMemo(\n  // note\n  () => \`${interpolated}\`,\n  [a],\n);`;
    expect(resolveIdentifier(memo, 'entryLink', memo.length)).toBe(
      interpolated,
    );
    const plain = "const x = '/blog';";
    expect(resolveIdentifier(plain, 'x', plain.length)).toBe('/blog');
    // the mis-resolution this replaced: a call expression must not borrow a
    // later string such as a className or a word from a type annotation
    const call = 'const target = getUrl();\nconst cls = "totally-unrelated";';
    expect(resolveIdentifier(call, 'target', call.length)).toBeNull();
    const annotated =
      'function P({ to }: { to: string }) {\n  const target = getUrl();';
    expect(resolveIdentifier(annotated, 'target', annotated.length)).toBeNull();
  });

  it('uses the declaration above the link when a name is reused in one file', () => {
    // Two component scopes reusing `target`. Preferring the useMemo form globally
    // answered the first link with the second declaration's external URL, so a
    // real internal link was reclassified as external and never validated.
    const src = [
      'function A() {',
      "  const target = '/missing';",
      '  return <a href={target}>a</a>;',
      '}',
      'function B() {',
      "  const target = useMemo(() => 'https://external', []);",
      '  return <a href={target}>b</a>;',
      '}',
    ].join('\n');

    const firstLink = src.indexOf('href={target}');
    const secondLink = src.indexOf('href={target}', firstLink + 1);

    expect(resolveIdentifier(src, 'target', firstLink)).toBe('/missing');
    expect(resolveIdentifier(src, 'target', secondLink)).toBe(
      'https://external',
    );
    // nothing declared above the very top of the file
    expect(resolveIdentifier(src, 'target', 0)).toBeNull();
  });

  it('does not let an unreadable declaration inherit an earlier literal', () => {
    const src = [
      'function A() {',
      "  const target = '/blog';",
      '  return <a href={target}>a</a>;',
      '}',
      'function B() {',
      '  const target = getUrl();',
      '  return <a href={target}>b</a>;',
      '}',
    ].join('\n');

    const first = src.indexOf('href={target}');
    const second = src.indexOf('href={target}', first + 1);

    expect(resolveIdentifier(src, 'target', first)).toBe('/blog');
    // nearest declaration above the second link is getUrl(), which we cannot
    // read, so it must be unclassified rather than borrowing '/blog'
    expect(resolveIdentifier(src, 'target', second)).toBeNull();
  });

  it('recognises the shapes the app actually uses', () => {
    // guards the matcher itself, so a broken matcher cannot silently pass the above
    expect(matches('/blog', '/blog')).toBe(true);
    expect(matches(`/@${ph('a')}/${ph('b')}`, '/$author/$permlink')).toBe(true);
    expect(matches('/edit/$author/$permlink', '/edit/$author/$permlink')).toBe(
      true,
    );
    expect(matches('/blog', '/$author/$permlink')).toBe(false);
    expect(isInternal('//evil.com')).toBe(false);
    // the regression this test exists for
    expect(routes.some((r) => matches(`/@${ph('author')}`, r))).toBe(false);
  });
});
