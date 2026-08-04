import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The login page is the only place a hosted site says it is configurable.
 *
 * The Configuration Editor renders through `AuthorizedFloatingMenu`, gated on
 * `useIsBlogOwner()`, so it exists only for a viewer who has already
 * authenticated as the instance owner. Nothing outside it says so, which leaves
 * the instruction reachable only by someone who has already followed it. The
 * owner has to be told on a page they can reach while logged out, or a site
 * runs indefinitely on whatever it was provisioned with.
 *
 * That makes two properties load-bearing, and neither is visible to the type
 * checker:
 *
 *   1. the hint is rendered under no condition at all. Gating it on ownership
 *      would restore the exact circularity it exists to break, and gating it on
 *      anything else would hide it from someone;
 *   2. the login methods are rendered in the order `orderAuthMethods` returns.
 *      Rendered in source order, a phone opens on an install prompt for a
 *      desktop browser extension.
 *
 * Nothing in `apps/self-hosted` is DOM-testable (`environment: 'node'`,
 * `include: ['src/**\/*.test.ts']`), so a source scan is the only guarantee
 * available. Modelled on `src/routes/-internal-links.test.ts` and
 * `src/features/shared/hive-disclosure-guard.test.ts`, which already drive the
 * TypeScript compiler API; `typescript` is a devDependency.
 *
 * Lives under src/routes with a `-` prefix, TanStack Router's convention for a
 * non-route file in the routes directory.
 */

const SRC = join(__dirname, '..');

const LOGIN_PAGE = 'routes/login.tsx';
const I18N_MODULE = 'core/i18n.ts';

const HINT_KEY = 'login_owner_hint';

/** Every login method card the page can render. */
const METHOD_COMPONENTS = [
  'ExtensionLogin',
  'HivesignerLogin',
  'HiveAuthLogin',
] as const;

function parseSource(code: string, name = 'probe.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    name,
    code,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
}

function parse(relative: string): ts.SourceFile {
  const path = join(SRC, relative);
  return parseSource(readFileSync(path, 'utf8'), path);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/**
 * Every `t('some_key')` call in the file, as the key plus the call node.
 *
 * Read as a call to the translator, not as an occurrence of the string. A
 * literal `"If this site is yours..."` typed straight into the JSX contains the
 * same words and would satisfy any text search while bypassing the locale
 * system entirely, which is the defect this codebase already carries in
 * `src/features/floating-menu/**`.
 */
function translationCalls(sf: ts.SourceFile): { key: string; node: ts.Node }[] {
  const found: { key: string; node: ts.Node }[] = [];
  walk(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length === 1
    ) {
      const [arg] = node.arguments;
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        found.push({ key: arg.text, node });
      }
    }
  });
  return found;
}

/**
 * The text of every condition this node renders under.
 *
 * `{isBlogOwner && <p>{t('login_owner_hint')}</p>}` renders the hint only for
 * someone who has already logged in, which is precisely the circularity the
 * hint exists to break, and an import-or-presence check would pass on it.
 */
function enclosingConditions(node: ts.Node, sf: ts.SourceFile): string[] {
  const conditions: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isConditionalExpression(current)) {
      conditions.push(current.condition.getText(sf));
    } else if (
      ts.isBinaryExpression(current) &&
      (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        current.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      conditions.push(current.left.getText(sf));
    } else if (ts.isIfStatement(current)) {
      conditions.push(current.expression.getText(sf));
    }
    current = current.parent;
  }
  return conditions;
}

/** Every JSX element in the subtree whose tag is one of `tags`. */
function jsxElements(root: ts.Node, sf: ts.SourceFile, tags: readonly string[]) {
  const found: { tag: string; node: ts.Node }[] = [];
  walk(root, (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tags.includes(tag)) found.push({ tag, node });
    }
  });
  return found;
}

/**
 * The `.map(...)` call the ordered login methods are rendered through.
 *
 * Follows the value rather than a name: the call to `orderAuthMethods` is found
 * first, then the variable it is declared into (through `useMemo`, or not), and
 * only then the `.map` on that variable. Matching a name like `orderedMethods`
 * would pass on a variable holding something else entirely.
 */
function orderedMethodsMap(sf: ts.SourceFile): ts.CallExpression | undefined {
  let binding: string | undefined;

  walk(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'orderAuthMethods'
    ) {
      let current: ts.Node | undefined = node;
      while (current && !ts.isSourceFile(current)) {
        if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
          binding = current.name.text;
          return;
        }
        current = current.parent;
      }
    }
  });

  if (!binding) return undefined;

  let mapCall: ts.CallExpression | undefined;
  walk(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === binding
    ) {
      mapCall = node;
    }
  });
  return mapCall;
}

/** Locales in `i18n.ts`, each mapped to its value for `key`, if it has one. */
function localeValues(
  sf: ts.SourceFile,
  key: string,
): Record<string, string | undefined> {
  const locales: Record<string, string | undefined> = {};

  walk(sf, (node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== 'translations' ||
      !node.initializer ||
      !ts.isObjectLiteralExpression(node.initializer)
    ) {
      return;
    }

    for (const locale of node.initializer.properties) {
      if (
        !ts.isPropertyAssignment(locale) ||
        !ts.isIdentifier(locale.name) ||
        !ts.isObjectLiteralExpression(locale.initializer)
      ) {
        continue;
      }
      let value: string | undefined;
      for (const entry of locale.initializer.properties) {
        if (!ts.isPropertyAssignment(entry) || !entry.name) continue;
        const name = ts.isIdentifier(entry.name)
          ? entry.name.text
          : ts.isStringLiteral(entry.name)
            ? entry.name.text
            : undefined;
        if (name !== key) continue;
        if (
          ts.isStringLiteral(entry.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(entry.initializer)
        ) {
          value = entry.initializer.text;
        }
      }
      locales[locale.name.text] = value;
    }
  });

  return locales;
}

/** The string members of a string-literal union type alias. */
function unionMembers(sf: ts.SourceFile, alias: string): string[] {
  const members: string[] = [];
  walk(sf, (node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== alias) return;
    const type = node.type;
    const parts = ts.isUnionTypeNode(type) ? type.types : [type];
    for (const part of parts) {
      if (ts.isLiteralTypeNode(part) && ts.isStringLiteral(part.literal)) {
        members.push(part.literal.text);
      }
    }
  });
  return members;
}

describe('the login page tells an owner the site is configurable', () => {
  const page = parse(LOGIN_PAGE);

  it('renders the hint through the locale system exactly once', () => {
    const calls = translationCalls(page).filter((c) => c.key === HINT_KEY);
    expect(calls).toHaveLength(1);
  });

  it('renders the hint under no condition at all', () => {
    // The whole point: it has to be readable by someone who is not logged in,
    // because the panel it describes only exists for someone who is.
    const [call] = translationCalls(page).filter((c) => c.key === HINT_KEY);
    expect(enclosingConditions(call.node, page)).toEqual([]);
  });

  it('places the hint inside the rendered output, not in a string constant', () => {
    const [call] = translationCalls(page).filter((c) => c.key === HINT_KEY);
    let inJsx = false;
    let current: ts.Node | undefined = call.node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isJsxExpression(current)) {
        inJsx = true;
        break;
      }
      current = current.parent;
    }
    expect(inJsx).toBe(true);
  });

  it('leaves no hardcoded English on the page for a locale to miss', () => {
    // Every string the page displays is a t() call, so these two must not come
    // back as literals the way they shipped.
    const source = page.getFullText();
    for (const literal of [
      'Choose your preferred login method',
      'Back to blog',
    ]) {
      expect(source).not.toContain(literal);
    }
  });
});

describe('the login methods are offered in the order the resolver returns', () => {
  const page = parse(LOGIN_PAGE);

  it('renders them by mapping the ordered list', () => {
    expect(orderedMethodsMap(page)).toBeDefined();
  });

  it('renders no method card outside that map', () => {
    // Source order is what put a desktop-extension install prompt first on a
    // phone. A card rendered next to the map, on its own `includes` check,
    // would restore that for whichever method it is.
    const map = orderedMethodsMap(page);
    const inside = new Set(
      jsxElements(map!, page, METHOD_COMPONENTS).map((e) => e.node),
    );
    const outside = jsxElements(page, page, METHOD_COMPONENTS)
      .filter((e) => !inside.has(e.node))
      .map((e) => e.tag);
    expect(outside).toEqual([]);
  });

  it('renders every method card the page imports', () => {
    const map = orderedMethodsMap(page);
    const rendered = jsxElements(map!, page, METHOD_COMPONENTS).map(
      (e) => e.tag,
    );
    expect([...rendered].sort()).toEqual([...METHOD_COMPONENTS].sort());
  });
});

describe('the hint is translated everywhere the app claims to be', () => {
  const i18n = parse(I18N_MODULE);
  const values = localeValues(i18n, HINT_KEY);

  it('is a declared translation key', () => {
    expect(unionMembers(i18n, 'TranslationKey')).toContain(HINT_KEY);
  });

  it('finds every locale the app ships', () => {
    // Guards the reader itself: an empty result would make the next test pass
    // vacuously.
    expect(Object.keys(values).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.keys(values))('%s defines it with real text', (locale) => {
    const value = values[locale];
    expect(value).toBeDefined();
    expect(value!.trim().length).toBeGreaterThan(0);
    expect(value).not.toBe(HINT_KEY);
  });
});

describe('the guard catches the ways around it', () => {
  const from = (code: string) => parseSource(code);

  it('reads the condition an owner gate would put around the hint', () => {
    const sf = from(
      "export const A = () => <div>{isBlogOwner && <p>{t('login_owner_hint')}</p>}</div>;",
    );
    const [call] = translationCalls(sf).filter((c) => c.key === HINT_KEY);
    expect(enclosingConditions(call.node, sf)).toContain('isBlogOwner');
  });

  it('reads the condition a ternary would put around the hint', () => {
    const sf = from(
      "export const A = () => <div>{user ? <p>{t('login_owner_hint')}</p> : null}</div>;",
    );
    const [call] = translationCalls(sf).filter((c) => c.key === HINT_KEY);
    expect(enclosingConditions(call.node, sf)).toContain('user');
  });

  it('does not accept the hint written as a literal', () => {
    const sf = from(
      'export const A = () => <p>If this site is yours, sign in with the account that owns it.</p>;',
    );
    expect(translationCalls(sf).filter((c) => c.key === HINT_KEY)).toEqual([]);
  });

  it('does not accept the key mentioned outside a t() call', () => {
    const sf = from("const KEY = 'login_owner_hint'; export const A = () => KEY;");
    expect(translationCalls(sf).filter((c) => c.key === HINT_KEY)).toEqual([]);
  });

  it('finds the map through a useMemo, and through a plain const', () => {
    for (const declaration of [
      'const ordered = useMemo(() => orderAuthMethods(m), [m]);',
      'const ordered = orderAuthMethods(m);',
    ]) {
      const sf = from(
        [
          'export const A = () => {',
          declaration,
          '  return <div>{ordered.map((x) => <ExtensionLogin key={x} />)}</div>;',
          '};',
        ].join('\n'),
      );
      expect(orderedMethodsMap(sf)).toBeDefined();
    }
  });

  it('does not accept a map over some other list', () => {
    // The hole a name match would leave: `orderedMethods` reading whatever it
    // likes, with the resolver called and thrown away.
    const sf = from(
      [
        'export const A = () => {',
        '  const ordered = orderAuthMethods(m);',
        '  const orderedMethods = availableMethods;',
        '  return <div>{orderedMethods.map((x) => <ExtensionLogin key={x} />)}</div>;',
        '};',
      ].join('\n'),
    );
    expect(orderedMethodsMap(sf)).toBeUndefined();
  });

  it('does not accept the resolver being absent', () => {
    const sf = from(
      'export const A = () => <div>{availableMethods.map((x) => <ExtensionLogin key={x} />)}</div>;',
    );
    expect(orderedMethodsMap(sf)).toBeUndefined();
  });

  it('sees a method card rendered beside the map', () => {
    const sf = from(
      [
        'export const A = () => {',
        '  const ordered = orderAuthMethods(m);',
        '  return (<div>',
        '    {ordered.map((x) => <HiveAuthLogin key={x} />)}',
        "    {available.includes('keychain') && <ExtensionLogin />}",
        '  </div>);',
        '};',
      ].join('\n'),
    );
    const map = orderedMethodsMap(sf)!;
    const inside = new Set(
      jsxElements(map, sf, METHOD_COMPONENTS).map((e) => e.node),
    );
    const outside = jsxElements(sf, sf, METHOD_COMPONENTS)
      .filter((e) => !inside.has(e.node))
      .map((e) => e.tag);
    expect(outside).toEqual(['ExtensionLogin']);
  });

  it('reads a locale block that is missing the key', () => {
    const sf = parseSource(
      [
        'const translations = {',
        "  en: { login_owner_hint: 'here' },",
        "  es: { login: 'hola' },",
        '};',
      ].join('\n'),
      'probe.ts',
    );
    expect(localeValues(sf, HINT_KEY)).toEqual({ en: 'here', es: undefined });
  });

  it('reads a union that is missing the key', () => {
    const sf = parseSource("type TranslationKey = 'login' | 'logout';", 'probe.ts');
    expect(unionMembers(sf, 'TranslationKey')).not.toContain(HINT_KEY);
  });
});
