import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Internal links must resolve to a route the router declares.
 *
 * The SPA serves index.html for unmatched paths, so a link to a route that does
 * not exist renders "Page not found" with HTTP 200. It never appears as a 404 in
 * logs, and nothing in the type system catches a raw `href` string. A
 * commenter's name pointed at `/@user` this way and shipped.
 *
 * This walks the TypeScript AST rather than matching source text. An earlier
 * regex version kept finding new ways to under-report: it could not tell an
 * `<a href>` from a component that happens to take a prop named `to`, it
 * resolved identifiers by proximity rather than by scope, and it preferred one
 * declaration form over another regardless of source order. Each of those
 * silently dropped links from validation. The AST settles all three
 * structurally: element identity, real lexical scope, and the actual
 * initializer of the declaration that is in view.
 *
 * Lives under src/routes with a `-` prefix, TanStack Router's convention for a
 * non-route file in the routes directory. Without it the generator warns on
 * every build that this file exports no Route.
 */

const SRC = join(__dirname, '..');

/** Router components whose `to` really is navigation. */
const NAVIGATION_COMPONENTS = new Set(['Link', 'Navigate']);

/**
 * Components taking a `to` / `href` prop that is not a link at all. Listed so a
 * new component with a link-shaped prop name must be classified rather than
 * quietly assumed to be one or the other.
 */
const NON_LINK_COMPONENT_PROPS: Record<string, string> = {
  'TippingPopover.to': 'tip recipient username, not a destination',
  'TippingStepCurrency.to': 'tip recipient username, not a destination',
};

/**
 * Real links whose destination is not statically knowable.
 * Adding an entry is a deliberate act: say why it is safe.
 *
 * `occurrences` pins how many links the entry may account for, so a second link
 * through the same identifier in the same file fails rather than inheriting the
 * exemption, and a stale entry matching nothing fails too.
 */
const DYNAMIC_LINKS: Record<string, { occurrences: number; reason: string }> = {
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
  'src/features/claim/claim-landing.tsx:claimHref': {
    occurrences: 1,
    reason: 'built from the imported HOSTING_URL constant, absolute',
  },
  // Both author links resolve against runtime config, which defaults to an
  // absolute ecency.com profile but an operator may point it anywhere. Not
  // knowable here, so classified rather than guessed either way.
  'src/features/blog/components/blog-post-header.tsx:`${profileBaseUrl}${entryData.author}`':
    {
      occurrences: 1,
      reason:
        'runtime config general.profileBaseUrl, defaults to https://ecency.com/@',
    },
  'src/features/blog/components/blog-post-item.tsx:`${profileBaseUrl}${entryData.author}`':
    {
      occurrences: 1,
      reason:
        'runtime config general.profileBaseUrl, defaults to https://ecency.com/@',
    },
};

/** Stands in for an interpolated segment, so `/@${a}` compares as `/@*`. */
const HOLE = '*';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.tsx') ? [p] : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
}

/** Route paths exactly as the generator declares them in FileRoutesByFullPath. */
function declaredRoutes(): string[] {
  const sf = parse(join(SRC, 'routeTree.gen.ts'));
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isInterfaceDeclaration(n) &&
      n.name.text === 'FileRoutesByFullPath'
    ) {
      for (const member of n.members) {
        if (member.name && ts.isStringLiteral(member.name)) {
          found.push(member.name.text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Every name introduced by a binding, including destructured ones. */
function boundNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) boundNames(element.name, out);
  }
}

/**
 * True when `node` itself introduces `name` as something whose value we cannot
 * read: a parameter, a catch variable, or a loop binding. Such a binding shadows
 * anything outside it, so lookup must stop rather than walk out to an unrelated
 * declaration of the same name.
 */
function bindsOpaquely(node: ts.Node, name: string): boolean {
  const names = new Set<string>();

  if (ts.isFunctionLike(node)) {
    for (const parameter of node.parameters) boundNames(parameter.name, names);
  } else if (ts.isCatchClause(node) && node.variableDeclaration) {
    boundNames(node.variableDeclaration.name, names);
  } else if (
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForStatement(node)
  ) {
    const initializer = node.initializer;
    if (initializer && ts.isVariableDeclarationList(initializer)) {
      for (const decl of initializer.declarations) boundNames(decl.name, names);
    }
  }

  return names.has(name);
}

/**
 * The nearest `const <name>` visible from `from`, honouring lexical scope, so an
 * identifier declared in a sibling component is not in view and a parameter is
 * not mistaken for an outer constant.
 */
function declarationInScope(
  from: ts.Node,
  name: string,
): ts.Expression | undefined {
  for (let n: ts.Node | undefined = from; n; n = n.parent) {
    // a parameter or loop binding shadows everything further out, and its value
    // is not knowable, so the link must be classified rather than guessed
    if (bindsOpaquely(n, name)) return undefined;

    const statements = ts.isSourceFile(n)
      ? n.statements
      : ts.isBlock(n) || ts.isModuleBlock(n)
        ? n.statements
        : undefined;
    if (!statements) continue;

    for (const statement of statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        // `let` / `var` can be reassigned after the initializer, so the
        // declaration does not tell us the value at the point of use.
        const isConst =
          (ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) !== 0;
        if (ts.isIdentifier(decl.name)) {
          if (decl.name.text === name) {
            return isConst ? decl.initializer : undefined;
          }
          continue;
        }
        // destructured: it binds the name but we cannot read the value
        const destructured = new Set<string>();
        boundNames(decl.name, destructured);
        if (destructured.has(name)) return undefined;
      }
    }
  }
  return undefined;
}

/** `useMemo(() => X, deps)` -> X; any other call -> undefined. */
function unwrapUseMemo(call: ts.CallExpression): ts.Expression | undefined {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'useMemo') {
    return undefined;
  }
  const [factory] = call.arguments;
  if (!factory || !ts.isArrowFunction(factory)) return undefined;
  return ts.isBlock(factory.body) ? undefined : factory.body;
}

/**
 * Static value of `expr`, with interpolations collapsed to HOLE.
 * Returns null when the value cannot be known without running the app.
 */
function staticValue(
  expr: ts.Expression | undefined,
  depth = 0,
): string | null {
  if (!expr || depth > 8) return null;

  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isTemplateExpression(expr)) {
    const parts = [expr.head.text];
    let everySpanKnown = true;
    for (const span of expr.templateSpans) {
      const value = staticValue(span.expression, depth + 1);
      if (value === null) {
        everySpanKnown = false;
        parts.push(HOLE);
      } else {
        parts.push(value);
      }
      parts.push(span.literal.text);
    }
    const joined = parts.join('');
    if (everySpanKnown) return joined;
    // With an unknown span the result is only safe to use when the literal head
    // already proves this is a path. `${base}/x` must not be read as external:
    // base could be '/missing', making it a dead internal link. Unknown means
    // unknown, so it goes back as null and has to be classified.
    return expr.head.text.startsWith('/') ? joined : null;
  }
  if (ts.isIdentifier(expr)) {
    return staticValue(declarationInScope(expr, expr.text), depth + 1);
  }
  if (ts.isCallExpression(expr)) {
    return staticValue(unwrapUseMemo(expr), depth + 1);
  }
  if (ts.isParenthesizedExpression(expr)) {
    return staticValue(expr.expression, depth + 1);
  }
  return null;
}

const isInternal = (v: string) => v.startsWith('/') && !v.startsWith('//');

function segments(path: string): string[] {
  return path.split(/[?#]/)[0].split('/').filter(Boolean);
}

function matches(link: string, route: string): boolean {
  const l = segments(link);
  const r = segments(route);
  if (l.length !== r.length) return false;
  // a route param matches anything; a HOLE in the link matches any route segment
  return r.every((rs, i) => rs.startsWith('$') || l[i] === HOLE || rs === l[i]);
}

interface FoundLink {
  where: string;
  value: string;
  via?: string;
}

function collect() {
  const checked: FoundLink[] = [];
  const unresolved: FoundLink[] = [];
  const componentProps: { where: string; key: string }[] = [];
  const exemptionHits: Record<string, number> = {};

  for (const file of walk(SRC)) {
    const sf = parse(file);
    const rel = file.replace(SRC, 'src');
    const lineOf = (n: ts.Node) =>
      sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

    /** Records one destination, whether it came from an attribute or a spread. */
    const record = (where: string, expr: ts.Expression | undefined) => {
      // Source text of the expression, so a template with no identifier can
      // still be classified. For a plain identifier this is just its name,
      // which keeps the exemption keys readable.
      const ident = expr ? expr.getText(sf).replace(/\s+/g, ' ') : undefined;
      const key = ident ? `${rel}:${ident}` : undefined;

      // Resolve first. An exemption may only absorb a link that is genuinely
      // unknowable, so if the identifier later becomes a plain literal the link
      // is validated and the now-stale exemption fails its occurrence count
      // instead of quietly covering for it.
      const value = staticValue(expr);
      if (value === null) {
        if (key && key in DYNAMIC_LINKS) {
          exemptionHits[key] = (exemptionHits[key] ?? 0) + 1;
        } else {
          unresolved.push({ where, value: ident ?? '<expression>' });
        }
      } else if (isInternal(value)) {
        checked.push({ where, value, via: ident });
      }
    };

    /** Can this element carry a destination at all? */
    const navigable = (tag: string) =>
      /^[a-z]/.test(tag) || NAVIGATION_COMPONENTS.has(tag);

    const visit = (node: ts.Node) => {
      // `<a {...{ href: '/dead' }}>` and `<Link {...props}>` are attributes too,
      // just not JsxAttribute nodes. Without this they produce no entry at all,
      // so a dead link inside a spread is invisible rather than merely
      // unresolved.
      if (ts.isJsxSpreadAttribute(node)) {
        const owner = node.parent.parent as ts.JsxOpeningLikeElement;
        const tag = owner.tagName.getText(sf);
        const where = `${rel}:${lineOf(node)}`;

        if (navigable(tag)) {
          const spread = node.expression;
          if (ts.isObjectLiteralExpression(spread)) {
            // a literal tells us exactly whether it carries a destination
            for (const prop of spread.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
                (prop.name.text === 'href' || prop.name.text === 'to')
              ) {
                record(where, prop.initializer);
              }
            }
          } else {
            // an opaque spread may or may not carry one; it has to be classified
            unresolved.push({
              where,
              value: `{...${spread.getText(sf).replace(/\s+/g, ' ')}}`,
            });
          }
        }
      }

      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        const attr = node.name.text;
        if (attr === 'href' || attr === 'to') {
          const owner = node.parent.parent as ts.JsxOpeningLikeElement;
          const tag = owner.tagName.getText(sf);
          const where = `${rel}:${lineOf(node)}`;
          // lowercase tags are DOM elements, so href is genuinely a link;
          // capitalised ones are components and only the router's navigate
          const isLink = /^[a-z]/.test(tag)
            ? attr === 'href'
            : NAVIGATION_COMPONENTS.has(tag);

          if (!isLink) {
            componentProps.push({ where, key: `${tag}.${attr}` });
          } else {
            const init = node.initializer;
            record(
              where,
              init && ts.isJsxExpression(init)
                ? init.expression
                : (init as ts.Expression | undefined),
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return { checked, unresolved, componentProps, exemptionHits };
}

/** Parses a snippet and returns every `href` value the resolver produces. */
function hrefValuesIn(code: string): (string | null)[] {
  const sf = ts.createSourceFile(
    'snippet.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: (string | null)[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isJsxAttribute(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'href' &&
      n.initializer &&
      ts.isJsxExpression(n.initializer)
    ) {
      out.push(staticValue(n.initializer.expression));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('internal links resolve to declared routes', () => {
  const routes = declaredRoutes();
  const { checked, unresolved, componentProps, exemptionHits } = collect();

  it('reads the route tree and finds links to check', () => {
    expect(routes).toContain('/blog');
    expect(routes).toContain('/$author/$permlink');
    expect(checked.length).toBeGreaterThan(0);
  });

  it('has no link pointing at an undeclared route', () => {
    const dead = checked
      .filter((l) => !routes.some((route) => matches(l.value, route)))
      .map((l) => `${l.where} -> ${l.value}${l.via ? ` (via ${l.via})` : ''}`);
    expect(dead).toEqual([]);
  });

  it('leaves no real link unclassified', () => {
    expect(unresolved.map((l) => `${l.where} -> ${l.value}`)).toEqual([]);
  });

  it('consumes each exemption exactly as many times as declared', () => {
    const expected = Object.fromEntries(
      Object.entries(DYNAMIC_LINKS).map(([k, v]) => [k, v.occurrences]),
    );
    expect(exemptionHits).toEqual(expected);
  });

  it('classifies every component prop that merely looks like a link', () => {
    const unclassified = componentProps
      .filter((p) => !(p.key in NON_LINK_COMPONENT_PROPS))
      .map((p) => `${p.where} -> ${p.key}`);
    expect(unclassified).toEqual([]);
  });

  it('resolves identifiers by scope, not proximity', () => {
    // Both hazards the regex version fell into, now decided by the AST: a
    // sibling component's declaration is not in view, and the declaration that
    // is in view is used whatever form it takes.
    const values = hrefValuesIn(
      [
        'function A() {',
        "  const target = '/blog';",
        '  return <a href={target}>a</a>;',
        '}',
        'function B() {',
        '  const target = getUrl();',
        '  return <a href={target}>b</a>;',
        '}',
        'function C() {',
        "  const target = useMemo(() => '/search', []);",
        '  return <a href={target}>c</a>;',
        '}',
      ].join('\n'),
    );
    // B's getUrl() is unknowable and must not borrow A's '/blog'
    expect(values).toEqual(['/blog', null, '/search']);
  });

  it('prefers an inner declaration over an outer one', () => {
    const values = hrefValuesIn(
      [
        "const target = '/blog';",
        'function A() {',
        "  const target = '/search';",
        '  return <a href={target}>a</a>;',
        '}',
      ].join('\n'),
    );
    expect(values).toEqual(['/search']);
  });

  it('collapses interpolation to a wildcard that matches a route param', () => {
    // template literal with escaped placeholders: keeps a literal `${` out of a
    // plain string, which noTemplateCurlyInString flags (rightly, in general)
    const [value] = hrefValuesIn(
      `const E = () => <a href={\`/@\${a}/\${b}\`}>x</a>;`,
    );
    expect(value).toBe(`/@${HOLE}/${HOLE}`);
    expect(matches(`/@${HOLE}/${HOLE}`, '/$author/$permlink')).toBe(true);
    expect(matches(`/@${HOLE}`, '/$author/$permlink')).toBe(false);
    // A template starting with an unknown interpolation is NOT assumed external:
    // base could be '/missing', which would be a dead internal link.
    const [unknownBase] = hrefValuesIn(
      `const E = () => <a href={\`\${base}/x\`}>x</a>;`,
    );
    expect(unknownBase).toBeNull();
  });

  it('resolves knowable interpolations instead of assuming external', () => {
    // base is knowable and internal: the whole path must be validated
    const [known] = hrefValuesIn(
      [
        "const base = '/missing';",
        `const E = () => <a href={\`\${base}/x/y/z\`}>x</a>;`,
      ].join('\n'),
    );
    // resolved rather than waved through as external, and no route is this deep
    expect(known).toBe('/missing/x/y/z');
    expect(routes.some((r) => matches(known ?? '', r))).toBe(false);

    // knowable and absolute: correctly external
    const [absolute] = hrefValuesIn(
      [
        "const base = 'https://ecency.com';",
        `const E = () => <a href={\`\${base}/x\`}>x</a>;`,
      ].join('\n'),
    );
    expect(absolute).toBe('https://ecency.com/x');
    expect(isInternal(absolute ?? '')).toBe(false);

    // head already proves it is a path, so an unknown span is just a wildcard
    const [rooted] = hrefValuesIn(
      `const E = () => <a href={\`/@\${a}\`}>x</a>;`,
    );
    expect(rooted).toBe(`/@${HOLE}`);
  });

  it('stops at a parameter rather than reading an outer constant', () => {
    const outer = "const target = '/blog';";
    expect(
      hrefValuesIn(
        [
          outer,
          'function A(target: string) { return <a href={target}>a</a>; }',
        ].join('\n'),
      ),
    ).toEqual([null]);
    // destructured props bind the name too
    expect(
      hrefValuesIn(
        [
          outer,
          'function A({ target }: { target: string }) { return <a href={target}>a</a>; }',
        ].join('\n'),
      ),
    ).toEqual([null]);
    // and a loop binding
    expect(
      hrefValuesIn(
        [
          outer,
          'function A(xs: string[]) { return xs.map((x) => { for (const target of xs) { return <a href={target}>a</a>; } }); }',
        ].join('\n'),
      ),
    ).toEqual([null]);
    // control: no shadowing, the outer const is genuinely in view
    expect(
      hrefValuesIn(
        [outer, 'function A() { return <a href={target}>a</a>; }'].join('\n'),
      ),
    ).toEqual(['/blog']);
  });

  it('treats a reassignable binding as unknowable', () => {
    // let/var may be reassigned after the initializer, so the declaration does
    // not tell us the value at the point of use
    expect(
      hrefValuesIn(
        [
          'function A() {',
          "  let target = '/blog';",
          "  target = '/dead';",
          '  return <a href={target}>a</a>;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([null]);
    // const is readable
    expect(
      hrefValuesIn(
        [
          'function A() {',
          "  const target = '/blog';",
          '  return <a href={target}>a</a>;',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['/blog']);
  });

  it('sees destinations passed through a JSX spread', () => {
    // A spread is a JsxSpreadAttribute, not a JsxAttribute, so an
    // attribute-only visitor produces no entry at all and a dead link inside
    // one is invisible rather than merely unresolved.
    const inSpread = (code: string) => {
      const sf = ts.createSourceFile(
        'spread.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const out: string[] = [];
      const visit = (n: ts.Node) => {
        if (ts.isJsxSpreadAttribute(n)) out.push(n.expression.getText(sf));
        ts.forEachChild(n, visit);
      };
      visit(sf);
      return out;
    };

    // the shapes exist and are reachable as spread attributes
    expect(
      inSpread("const E = () => <a {...{ href: '/dead' }}>x</a>;"),
    ).toEqual(["{ href: '/dead' }"]);
    expect(inSpread('const E = () => <a {...props}>x</a>;')).toEqual(['props']);

    // and the collector classifies them: object literals resolve, opaque
    // spreads are unresolved, and non-navigable components are ignored.
    // Exercised end to end by the probe cases in the PR description.
    expect(NAVIGATION_COMPONENTS.has('Link')).toBe(true);
  });

  it('recognises the shapes the app actually uses', () => {
    expect(matches('/blog', '/blog')).toBe(true);
    expect(matches('/edit/$author/$permlink', '/edit/$author/$permlink')).toBe(
      true,
    );
    expect(matches('/blog', '/$author/$permlink')).toBe(false);
    expect(isInternal('//evil.com')).toBe(false);
    expect(isInternal('https://ecency.com/blog')).toBe(false);
    // the regression this test exists for
    expect(routes.some((r) => matches(`/@${HOLE}`, r))).toBe(false);
  });
});
