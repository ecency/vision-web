import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every internal link in the app must resolve to a route the router declares.
 *
 * The SPA serves index.html for unmatched paths, so a link to a route that does
 * not exist renders the "Page not found" screen with HTTP 200. It never shows up
 * as a 404 in logs and nothing in the type system catches it, because these are
 * raw `href` strings rather than typed `<Link to>`. A commenter's name pointed at
 * `/@user` this way and shipped.
 */

const SRC = join(__dirname, '..');

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

/** Literal `href` / `to` values that start with a single slash. */
function internalLinks(file: string) {
  const source = readFileSync(file, 'utf8');
  const found: { raw: string; line: number }[] = [];
  const re = /\b(?:href|to)=\{?[`"'](\/(?!\/)[^`"']*)[`"']/g;
  for (const m of source.matchAll(re)) {
    found.push({
      raw: m[1],
      line: source.slice(0, m.index).split('\n').length,
    });
  }
  return found;
}

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

describe('internal links resolve to declared routes', () => {
  const routes = declaredRoutes();
  const files = walk(SRC);

  it('finds the route tree and some links to check', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
  });

  it('has no link pointing at an undeclared route', () => {
    const dead: string[] = [];
    for (const file of files) {
      for (const { raw, line } of internalLinks(file)) {
        if (!routes.some((route) => matches(raw, route))) {
          dead.push(`${file.replace(SRC, 'src')}:${line} -> ${raw}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('recognises the shapes the app actually uses', () => {
    // guards the matcher itself, so a broken matcher cannot silently pass the above
    expect(matches('/blog', '/blog')).toBe(true);
    expect(matches('/@${a}/${b}', '/$author/$permlink')).toBe(true);
    expect(matches('/edit/$author/$permlink', '/edit/$author/$permlink')).toBe(true);
    expect(matches('/blog', '/$author/$permlink')).toBe(false);
    // the regression this test exists for
    expect(routes.some((r) => matches('/@${author}', r))).toBe(false);
  });
});
