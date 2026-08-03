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
 * Destinations are read through the TypeScript type checker. Earlier versions
 * did their own lexical analysis and each review round found another form they
 * had not enumerated: declaration shape, then scope, then parameters, then
 * template interpolation, then mutability, then JSX spreads. The checker
 * answers all of those from one mechanism, and answers several the lexical
 * version could not reach at all:
 *
 *   const good = '/blog'          -> "/blog"
 *   import { EXT } from './x'     -> "/imported"   (cross-file)
 *   `${base}/x`                   -> "/missing/x"  (template literal types)
 *   let m = '/a'; m = '/b'        -> string, so not a literal, so unknown
 *   function A(href) { … }        -> string, so unknown
 *
 * What remains explicit is policy, not analysis: which elements navigate, and
 * which unknowable destinations are acceptable.
 *
 * Lives under src/routes with a `-` prefix, TanStack Router's convention for a
 * non-route file in the routes directory. Without it the generator warns on
 * every build that this file exports no Route.
 */

const APP = join(__dirname, '..', '..');
const SRC = join(APP, 'src');

/** DOM elements whose `href` is a navigation destination. */
const NAVIGABLE_INTRINSICS = new Set(['a', 'area']);

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
 * through the same expression in the same file fails rather than inheriting the
 * exemption, and a stale entry matching nothing fails too. An exemption is only
 * consumed when the checker genuinely cannot resolve the value, so an entry
 * whose target becomes a literal fails instead of covering for it.
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

const LINK_ATTRS = ['href', 'to'] as const;

/** How far to follow nested object spreads before giving up and reporting. */
const MAX_SPREAD_DEPTH = 4;

/** Stands in for an interpolated segment, so `/@${a}` compares as `/@*`. */
const HOLE = '*';

/**
 * Interpolations known to be a single path segment.
 *
 * A HOLE stands for exactly one segment, but an arbitrary string is not
 * slash-free: `/blog/${tail}` with tail = 'x/y/z' is a four-segment path at
 * runtime while the shape says two. So a template with an unreadable
 * interpolation is only shaped when every such interpolation is listed here;
 * otherwise it stays unresolved and has to be classified.
 *
 * Keyed by `file:expression` with an occurrence count, exactly like
 * DYNAMIC_LINKS: a bare expression name would declare `entry.author` slash-free
 * everywhere, including in some future component whose `entry.author` is not a
 * username at all.
 */
const SEGMENT_SAFE: Record<string, { occurrences: number; reason: string }> = {
  'src/features/blog/components/blog-discussion-item.tsx:entry.author': {
    occurrences: 1,
    reason: 'Hive username, cannot contain a slash',
  },
  'src/features/blog/components/blog-discussion-item.tsx:entry.permlink': {
    occurrences: 1,
    reason: 'Hive permlink, cannot contain a slash',
  },
};

interface FoundLink {
  where: string;
  value: string;
  via?: string;
}

interface Buckets {
  checked: FoundLink[];
  unresolved: FoundLink[];
  componentProps: { where: string; key: string }[];
  exemptionHits: Record<string, number>;
  safeHits: Record<string, number>;
}

function emptyBuckets(): Buckets {
  return {
    checked: [],
    unresolved: [],
    componentProps: [],
    exemptionHits: {},
    safeHits: {},
  };
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

/** The string this expression is known to be, or undefined if not knowable. */
function literalOf(checker: ts.TypeChecker, node: ts.Node): string | undefined {
  // A JSX attribute written as `to="/blog"` types as the element's declared prop
  // type, not as a literal, so read the syntax directly when it is one.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  const type = checker.getTypeAtLocation(node);
  return type.isStringLiteral() ? type.value : undefined;
}

/**
 * `{ href }` has no initializer node and its property type is widened, so ask
 * the checker for the symbol the shorthand refers to.
 */
function shorthandLiteral(
  checker: ts.TypeChecker,
  prop: ts.ShorthandPropertyAssignment,
): string | undefined {
  const symbol = checker.getShorthandAssignmentValueSymbol(prop);
  if (!symbol) return undefined;
  const type = checker.getTypeOfSymbolAtLocation(symbol, prop);
  return type.isStringLiteral() ? type.value : undefined;
}

/** `useMemo(() => X, deps)` -> X, so a memoised destination is still readable. */
function unwrapUseMemo(call: ts.CallExpression): ts.Expression | undefined {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'useMemo') {
    return undefined;
  }
  const [factory] = call.arguments;
  if (!factory || !ts.isArrowFunction(factory) || ts.isBlock(factory.body)) {
    return undefined;
  }
  return factory.body;
}

/** The expression a const identifier was initialised with, via real symbol resolution. */
function constInitializer(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Expression | undefined {
  if (!ts.isIdentifier(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node);
  const decl = symbol?.valueDeclaration;
  if (!decl || !ts.isVariableDeclaration(decl)) return undefined;
  if ((ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) === 0)
    return undefined;
  const init = decl.initializer;
  if (init && ts.isCallExpression(init)) return unwrapUseMemo(init);
  return init;
}

/**
 * The route *shape* of a template whose literal head already proves it is a
 * path, with unknowable interpolations standing in as HOLE.
 *
 * The checker gives an exact value or nothing, but `/@${author}` has no exact
 * value and is still the case this test exists for: its segment structure is
 * what makes it a dead link. A template whose head does not start with `/`
 * returns undefined rather than being assumed external, since the leading
 * interpolation could itself be an internal path.
 */
function pathShape(
  checker: ts.TypeChecker,
  node: ts.Node,
  rel: string,
  safeHits: Record<string, number>,
  depth = 0,
): string | undefined {
  if (depth > 4) return undefined;

  if (ts.isTemplateExpression(node)) {
    if (!node.head.text.startsWith('/')) return undefined;
    let shape = node.head.text;
    for (const span of node.templateSpans) {
      const known = literalOf(checker, span.expression);
      if (known !== undefined) {
        shape += known + span.literal.text;
        continue;
      }
      // an unreadable interpolation only counts as one segment if we have said
      // so; otherwise the segment count is a guess and the shape is worthless
      const key = `${rel}:${span.expression.getText().replace(/\s+/g, ' ')}`;
      if (!(key in SEGMENT_SAFE)) return undefined;
      safeHits[key] = (safeHits[key] ?? 0) + 1;
      shape += HOLE + span.literal.text;
    }
    return shape;
  }

  const init = constInitializer(checker, node);
  return init ? pathShape(checker, init, rel, safeHits, depth + 1) : undefined;
}

/**
 * Walks one source file and files every navigation destination it can see.
 * Shared by the repository sweep and by the unit tests, so the tests exercise
 * the real classification rather than a reimplementation of it.
 */
function collectFrom(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
  rel: string,
  into: Buckets,
): void {
  const lineOf = (n: ts.Node) =>
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const label = (n: ts.Node) => n.getText(sf).replace(/\s+/g, ' ');

  const record = (where: string, node: ts.Node | undefined) => {
    const via = node ? label(node) : undefined;
    const key = via ? `${rel}:${via}` : undefined;
    const value = node
      ? (literalOf(checker, node) ??
        pathShape(checker, node, rel, into.safeHits))
      : undefined;

    if (value === undefined) {
      if (key && key in DYNAMIC_LINKS) {
        into.exemptionHits[key] = (into.exemptionHits[key] ?? 0) + 1;
      } else {
        into.unresolved.push({ where, value: via ?? '<expression>' });
      }
    } else if (isInternal(value)) {
      into.checked.push({ where, value, via });
    }
  };

  // The attribute matters as much as the tag: a router component navigates
  // through `to`, a DOM element through `href`. Ignoring the attribute made
  // every prop on a <Link> look like a destination.
  const navigates = (tag: string, attr: string) =>
    /^[a-z]/.test(tag)
      ? NAVIGABLE_INTRINSICS.has(tag) && attr === 'href'
      : NAVIGATION_COMPONENTS.has(tag) && attr === 'to';

  const canNavigate = (tag: string) =>
    (LINK_ATTRS as readonly string[]).some((attr) => navigates(tag, attr));

  /**
   * A spread may carry a destination. Object literals are read property by
   * property, covering shorthand and nested spreads; anything else is asked of
   * its type, so `{...props}` on a type without href is correctly ignored while
   * one with a non-literal href becomes unresolved.
   */
  const fromSpread = (
    where: string,
    expr: ts.Expression,
    tag: string,
    depth = 0,
  ) => {
    // Nothing on this element can be a destination, so no property of a spread
    // onto it can be either. Checked before any reporting, or a computed key on
    // a <div> would be reported as an unclassified link.
    if (!canNavigate(tag)) return;

    // Bounded recursion must still leave a trace: silently returning here would
    // let a deeply nested spread hide a destination entirely.
    if (depth > MAX_SPREAD_DEPTH) {
      into.unresolved.push({
        where,
        value: `{...${label(expr)}} (nested beyond ${MAX_SPREAD_DEPTH})`,
      });
      return;
    }

    if (ts.isObjectLiteralExpression(expr)) {
      for (const prop of expr.properties) {
        if (ts.isSpreadAssignment(prop)) {
          fromSpread(where, prop.expression, tag, depth + 1);
          continue;
        }
        let name: string | undefined;
        if (
          prop.name &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
        ) {
          name = prop.name.text;
        } else if (prop.name && ts.isComputedPropertyName(prop.name)) {
          // `{ ['href']: '/dead' }` names a destination just as plainly as
          // `{ href: ... }`. A key we cannot read might be one, so the whole
          // spread has to be classified rather than skipped.
          name = literalOf(checker, prop.name.expression);
          if (name === undefined) {
            into.unresolved.push({ where, value: `{...{ [computed] }}` });
            continue;
          }
        }
        if (
          !name ||
          !(LINK_ATTRS as readonly string[]).includes(name) ||
          !navigates(tag, name)
        ) {
          continue;
        }

        if (ts.isPropertyAssignment(prop)) {
          record(where, prop.initializer);
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const value = shorthandLiteral(checker, prop);
          if (value === undefined) {
            into.unresolved.push({ where, value: `{...{ ${name} }}` });
          } else if (isInternal(value)) {
            into.checked.push({ where, value, via: `{...{ ${name} }}` });
          }
        } else {
          into.unresolved.push({ where, value: `{...{ ${name} }}` });
        }
      }
      return;
    }

    // A declared type cannot prove the absence of a destination at runtime.
    // `any` and index signatures obviously carry anything, and a plain object
    // type does too: `{ href: '/dead', className: 'x' }` assigned to
    // `{ className: string }` still has href when it is spread. So only a
    // literal we can read is accepted; every other opaque spread onto a
    // navigable element is classified.
    const type = checker.getTypeAtLocation(expr);
    for (const attr of LINK_ATTRS) {
      if (!navigates(tag, attr)) continue;
      const prop = type.getProperty(attr);
      const propType = prop
        ? checker.getTypeOfSymbolAtLocation(prop, expr)
        : undefined;

      if (propType?.isStringLiteral()) {
        const value = propType.value;
        if (isInternal(value)) {
          into.checked.push({ where, value, via: `{...${label(expr)}}` });
        }
      } else {
        into.unresolved.push({ where, value: `{...${label(expr)}}` });
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxSpreadAttribute(node)) {
      const owner = node.parent.parent as ts.JsxOpeningLikeElement;
      fromSpread(
        `${rel}:${lineOf(node)}`,
        node.expression,
        owner.tagName.getText(sf),
      );
    }

    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attr = node.name.text;
      if (attr === 'href' || attr === 'to') {
        const owner = node.parent.parent as ts.JsxOpeningLikeElement;
        const tag = owner.tagName.getText(sf);
        const where = `${rel}:${lineOf(node)}`;

        if (navigates(tag, attr)) {
          const init = node.initializer;
          record(
            where,
            init && ts.isJsxExpression(init) ? init.expression : init,
          );
        } else {
          into.componentProps.push({ where, key: `${tag}.${attr}` });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

function compilerOptions(): ts.CompilerOptions {
  const configPath = join(APP, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config ?? {}, ts.sys, APP);
  return { ...parsed.options, noEmit: true };
}

/** Route paths exactly as the generator declares them in FileRoutesByFullPath. */
function declaredRoutes(sf: ts.SourceFile): string[] {
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

function sweepRepository() {
  const options = compilerOptions();
  const configPath = join(APP, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config ?? {}, ts.sys, APP);
  const program = ts.createProgram(parsed.fileNames, options);
  const checker = program.getTypeChecker();

  const buckets = emptyBuckets();
  let routes: string[] = [];

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const file = sf.fileName;
    if (!file.startsWith(SRC)) continue;
    if (file.endsWith('routeTree.gen.ts')) routes = declaredRoutes(sf);
    if (!file.endsWith('.tsx')) continue;
    collectFrom(sf, checker, file.replace(SRC, 'src'), buckets);
  }

  return { ...buckets, routes };
}

/**
 * Snippets are self-contained, so they compile against a minimal environment
 * rather than the app's full tsconfig: about 90 files instead of about 1280,
 * roughly halving this file's runtime. The host and the previous program are
 * reused so only the changed snippet is re-parsed. Resolution is identical and
 * `collectFrom` is the same code the repository sweep runs.
 */
const SNIPPET_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

const SNIPPET_FILE = join(SRC, '__probe__.tsx');
let snippetCode = '';
let snippetProgram: ts.Program | undefined;

const snippetHost = (() => {
  const host = ts.createCompilerHost(SNIPPET_OPTIONS, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (f) => (f === SNIPPET_FILE ? true : fileExists(f));
  host.readFile = (f) => (f === SNIPPET_FILE ? snippetCode : readFile(f));
  host.getSourceFile = (f, ...rest) =>
    f === SNIPPET_FILE
      ? ts.createSourceFile(
          SNIPPET_FILE,
          snippetCode,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
      : getSourceFile(f, ...rest);
  return host;
})();

/** Runs the real classifier over a snippet, in memory. */
function classify(code: string): Buckets {
  snippetCode = code;
  const program = ts.createProgram(
    [SNIPPET_FILE],
    SNIPPET_OPTIONS,
    snippetHost,
    snippetProgram,
  );
  snippetProgram = program;

  const sf = program.getSourceFile(SNIPPET_FILE);
  const buckets = emptyBuckets();
  if (sf) {
    collectFrom(sf, program.getTypeChecker(), 'src/__probe__.tsx', buckets);
  }
  return buckets;
}

describe('internal links resolve to declared routes', () => {
  const {
    checked,
    unresolved,
    componentProps,
    exemptionHits,
    safeHits,
    routes,
  } = sweepRepository();

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

  it('consumes each segment-safety entry exactly as many times as declared', () => {
    // Same rule as DYNAMIC_LINKS: scoped to a file, counted, so a stale entry
    // fails and a second use in that file has to be looked at.
    const expected = Object.fromEntries(
      Object.entries(SEGMENT_SAFE).map(([k, v]) => [k, v.occurrences]),
    );
    expect(safeHits).toEqual(expected);
    for (const key of Object.keys(SEGMENT_SAFE)) {
      expect(key).toMatch(/^src\/.+\.tsx:.+$/);
    }
  });

  it('classifies every component prop that merely looks like a link', () => {
    const unclassified = componentProps
      .filter((p) => !(p.key in NON_LINK_COMPONENT_PROPS))
      .map((p) => `${p.where} -> ${p.key}`);
    expect(unclassified).toEqual([]);
  });

  describe('classification', () => {
    const values = (b: Buckets) => b.checked.map((l) => l.value);
    const unknown = (b: Buckets) => b.unresolved.map((l) => l.value);

    it('resolves consts, imports and template literals', () => {
      const b = classify(
        [
          "const good = '/blog';",
          "const base = '/missing';",
          'export const A = () => <a href={good}>1</a>;',
          `export const B = () => <a href={\`\${base}/x/y/z\`}>2</a>;`,
        ].join('\n'),
      );
      expect(values(b)).toEqual(['/blog', '/missing/x/y/z']);
      expect(unknown(b)).toEqual([]);
    });

    it('treats parameters, destructuring and reassignment as unknowable', () => {
      const b = classify(
        [
          "const target = '/blog';",
          'export const A = (target: string) => <a href={target}>1</a>;',
          'export const B = ({ target }: { target: string }) => <a href={target}>2</a>;',
          "export const C = () => { let m = '/blog'; m = '/dead'; return <a href={m}>3</a>; };",
        ].join('\n'),
      );
      expect(values(b)).toEqual([]);
      expect(unknown(b)).toHaveLength(3);
    });

    it('reads destinations out of every spread shape', () => {
      const literal = classify(
        "export const A = () => <a {...{ href: '/dead' }}>1</a>;",
      );
      expect(values(literal)).toEqual(['/dead']);

      const shorthand = classify(
        [
          "const href = '/dead';",
          'export const A = () => <a {...{ href }}>1</a>;',
        ].join('\n'),
      );
      expect(values(shorthand)).toEqual(['/dead']);

      const nested = classify(
        [
          "const href = '/dead';",
          'export const A = () => <a {...{ ...{ href } }}>1</a>;',
        ].join('\n'),
      );
      expect(values(nested)).toEqual(['/dead']);

      const opaque = classify(
        'export const A = (props: { href: string }) => <a {...props}>1</a>;',
      );
      expect(unknown(opaque)).toEqual(['{...props}']);
    });

    it('ignores spreads onto elements that cannot navigate', () => {
      // common prop forwarding must not be reported
      const div = classify(
        'export const A = (props: { href: string }) => <div {...props}>1</div>;',
      );
      expect(unknown(div)).toEqual([]);
      expect(values(div)).toEqual([]);
    });

    it('does not let a declared type prove a spread carries no destination', () => {
      // A type without href does not mean the value has none: an object with
      // href assigned to { className: string } keeps it when spread. Likewise
      // `any` and index signatures carry anything. All must be classified.
      for (const props of [
        '{ className: string }',
        'any',
        'Record<string, string>',
      ]) {
        const b = classify(
          `export const A = (props: ${props}) => <a {...props}>1</a>;`,
        );
        expect(unknown(b)).toEqual(['{...props}']);
      }
    });

    it('only treats the right attribute on the right element as navigation', () => {
      // a router component navigates through `to`, not through every prop
      const search = classify(
        [
          'declare const Link: (p: { to: string; search?: object }) => null;',
          'declare function buildSearch(): object;',
          'export const A = () => <Link to="/blog" {...{ search: buildSearch() }} />;',
        ].join('\n'),
      );
      expect(unknown(search)).toEqual([]);
      expect(values(search)).toEqual(['/blog']);

      // and an opaque spread onto it reports once, not once per link attribute
      const once = classify(
        [
          'declare const Link: (p: { to: string }) => null;',
          'export const A = (props: { to: string }) => <Link {...props} />;',
        ].join('\n'),
      );
      expect(unknown(once)).toEqual(['{...props}']);
    });

    it('does not report spreads onto elements that cannot navigate', () => {
      const computedOnDiv = classify(
        [
          'declare const k: string;',
          "export const A = () => <div {...{ [k]: '/x' }}>1</div>;",
        ].join('\n'),
      );
      expect(unknown(computedOnDiv)).toEqual([]);
      expect(values(computedOnDiv)).toEqual([]);
    });

    it('will not guess how many segments an unknown interpolation spans', () => {
      // tail could be 'x/y/z', so /blog/${tail} is not a two-segment path
      const spanning = classify(
        `export const A = (p: { tail: string }) => <a href={\`/blog/\${p.tail}\`}>1</a>;`,
      );
      expect(unknown(spanning)).toHaveLength(1);
      expect(values(spanning)).toEqual([]);
    });

    it('records a destination hidden beyond the nesting limit', () => {
      const deep = classify(
        [
          "const href = '/dead';",
          'export const A = () => <a {...{...{...{...{...{...{ href }}}}}}}>1</a>;',
        ].join('\n'),
      );
      expect(unknown(deep).length + values(deep).length).toBeGreaterThan(0);
    });

    it('reads computed destination keys', () => {
      const known = classify(
        "export const A = () => <a {...{ ['href']: '/dead' }}>1</a>;",
      );
      expect(values(known)).toEqual(['/dead']);

      // a key we cannot read might be href, so the spread is classified
      const unknownKey = classify(
        [
          'declare const k: string;',
          "export const A = () => <a {...{ [k]: '/dead' }}>1</a>;",
        ].join('\n'),
      );
      expect(unknown(unknownKey)).toEqual(['{...{ [computed] }}']);
    });

    it('separates navigation from props that merely share the name', () => {
      const b = classify(
        'export const A = (to: string) => <TippingPopover to={to} />;',
      );
      expect(b.componentProps.map((p) => p.key)).toEqual(['TippingPopover.to']);
      expect(unknown(b)).toEqual([]);
    });

    it('treats router components as navigation', () => {
      const b = classify("export const A = () => <Link to='/blog'>1</Link>;");
      expect(values(b)).toEqual(['/blog']);
    });
  });

  it('recognises the route shapes the app uses', () => {
    expect(matches('/blog', '/blog')).toBe(true);
    expect(matches('/@alice/post', '/$author/$permlink')).toBe(true);
    expect(matches('/blog', '/$author/$permlink')).toBe(false);
    expect(isInternal('//evil.com')).toBe(false);
    expect(isInternal('https://ecency.com/blog')).toBe(false);
    // the regression this test exists for
    expect(routes.some((r) => matches('/@alice', r))).toBe(false);
  });
});
