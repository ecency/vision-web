import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every `*-theme*` class the app writes must actually produce CSS.
 *
 * Tailwind cannot generate a variant for a class it did not create. The theme
 * classes were hand-written rules in components.css, so `bg-theme-tertiary`
 * rendered while `hover:bg-theme-tertiary` rendered nothing at all, silently,
 * on every instance. Nobody noticed for as long as the classes have existed:
 * 28 hover and focus states were written, reviewed and shipped dead.
 *
 * The check compiles the real src/globals.css with the project's own Tailwind
 * and asks, for each class literal the components actually write, whether the
 * stylesheet ends up containing a rule for it. Two ways that can be true:
 *
 *   generated  the class adds bytes when fed to the compiler as a candidate,
 *              which is what a registered @theme namespace does
 *   authored   a rule for the class is already in the baseline, which is what
 *              the multi-property composites in components.css are
 *
 * Neither is enough on its own, and both at once is its own defect: an authored
 * rule in components.css is unlayered, so it beats the generated utility and
 * every variant of it, which is the exact failure this file exists to catch.
 * `theme-classes emit exactly one rule` fails on that.
 *
 * Candidates are read through the TypeScript checker from `className` /
 * `class` attributes and `clsx()` arguments rather than lexically, because a
 * lexical sweep picks up `data-theme` (an attribute name, not a class) and
 * config paths such as `configuration.general.theme`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..', '..');
const SRC = join(APP, 'src');
const UI_SRC = resolve(APP, '..', '..', 'packages', 'ui', 'src');

/**
 * Classes with no rule and no namespace, allowed only because they are already
 * broken on `develop` and are removed by a named step rather than by this file.
 *
 * The list may shrink and must never grow: a stale entry fails
 * `every allowlisted class is genuinely dead`, so nothing can hide here after
 * it starts working, and a newly dead class fails the emission check instead of
 * being added.
 */
const KNOWN_UNREGISTERED: Record<string, string> = {
  'focus:ring-theme-strong': 'no ring-theme-strong rule and no namespace',
  'hover:bg-theme-secondary': 'variant of a hand-written class',
  'hover:bg-theme-tertiary': 'variant of a hand-written class',
  'hover:border-theme': 'variant of a hand-written class',
  'hover:border-theme-strong': 'variant of a hand-written class',
  'hover:text-theme-primary': 'variant of a hand-written class',
  'placeholder:text-theme-muted': 'variant of a hand-written class',
};

/** Controls. Ordinary Tailwind classes, to prove the harness can see emission. */
const CONTROLS = ['bg-red-500', 'hover:bg-red-500'];

const CLASS_ATTRIBUTES = new Set(['className', 'class']);
const CLASS_HELPERS = new Set(['clsx', 'classNames', 'cn']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * String literal values of a type, or null when the type is not made only of
 * string literals. A union of literals (a ternary) yields every branch; a plain
 * `string` yields null so the caller falls back to walking the expression.
 */
function literalStrings(type: ts.Type): string[] | null {
  const parts = type.isUnion() ? type.types : [type];
  const out: string[] = [];
  for (const part of parts) {
    if (part.isStringLiteral()) {
      out.push(part.value);
    } else {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

function collectTokens(
  node: ts.Node | undefined,
  checker: ts.TypeChecker,
  into: Set<string>,
): void {
  if (!node) return;

  if (ts.isJsxExpression(node)) {
    collectTokens(node.expression, checker, into);
    return;
  }

  // A literal in a `className` position is contextually typed by the prop, so
  // the checker widens it to `string`. Read those syntactically; the checker is
  // for the values it can reach and the syntax cannot, such as an identifier
  // bound to a module-level class string, possibly in another file.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    for (const token of node.text.split(/\s+/)) if (token) into.add(token);
    return;
  }

  const literals = ts.isExpression(node)
    ? literalStrings(checker.getTypeAtLocation(node))
    : null;
  if (literals) {
    for (const value of literals) {
      for (const token of value.split(/\s+/)) if (token) into.add(token);
    }
    return;
  }

  if (ts.isTemplateExpression(node)) {
    for (const token of node.head.text.split(/\s+/)) if (token) into.add(token);
    for (const span of node.templateSpans) {
      collectTokens(span.expression, checker, into);
      for (const token of span.literal.text.split(/\s+/))
        if (token) into.add(token);
    }
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectTokens(node.whenTrue, checker, into);
    collectTokens(node.whenFalse, checker, into);
    return;
  }
  if (ts.isBinaryExpression(node)) {
    collectTokens(node.left, checker, into);
    collectTokens(node.right, checker, into);
    return;
  }
  if (ts.isParenthesizedExpression(node)) {
    collectTokens(node.expression, checker, into);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collectTokens(element, checker, into);
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    // clsx({ 'bg-theme': cond }) keys the class off the property name.
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      if (ts.isStringLiteral(name) || ts.isIdentifier(name)) {
        for (const token of name.text.split(/\s+/)) if (token) into.add(token);
      }
    }
    return;
  }
  if (
    ts.isCallExpression(node) &&
    CLASS_HELPERS.has(node.expression.getText())
  ) {
    for (const argument of node.arguments)
      collectTokens(argument, checker, into);
  }
}

/** Every class literal written into a `className` / `class` prop or clsx(). */
function classLiterals(): Map<string, string[]> {
  const configPath = join(APP, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config ?? {}, ts.sys, APP);
  const program = ts.createProgram(
    [...parsed.fileNames, ...walk(UI_SRC)],
    parsed.options,
  );
  const checker = program.getTypeChecker();

  const sites = new Map<string, string[]>();
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    const file = source.fileName;
    if (!file.startsWith(SRC) && !file.startsWith(UI_SRC)) continue;
    if (/\.test\.tsx?$/.test(file)) continue;

    const tokens = new Set<string>();
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node) &&
        CLASS_ATTRIBUTES.has(node.name.getText())
      ) {
        collectTokens(node.initializer, checker, tokens);
      } else if (
        ts.isCallExpression(node) &&
        CLASS_HELPERS.has(node.expression.getText())
      ) {
        for (const argument of node.arguments)
          collectTokens(argument, checker, tokens);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    for (const token of tokens) {
      const at = sites.get(token) ?? [];
      at.push(relative(APP, file));
      sites.set(token, at);
    }
  }
  return sites;
}

/**
 * A config path such as `configuration.general.theme` is a string in a
 * `clsx()`-adjacent position often enough to matter. Tailwind's own dotted
 * tokens are numeric (`p-1.5`) or bracketed (`leading-[1.04]`).
 */
function isConfigPathLike(token: string): boolean {
  if (!token.includes('.')) return false;
  if (token.includes('[')) return false;
  return !/\d\.\d/.test(token);
}

function themeCandidates(sites: Map<string, string[]>): string[] {
  return [...sites.keys()]
    .filter((token) => token.includes('theme'))
    .filter((token) => !isConfigPathLike(token))
    .filter((token) => /^[a-z0-9][a-z0-9:/[\]().,%_!-]*$/i.test(token))
    .sort();
}

async function loadStylesheet(id: string, base: string) {
  const path = id.startsWith('tailwindcss')
    ? join(
        APP,
        'node_modules',
        id === 'tailwindcss' ? 'tailwindcss/index.css' : id,
      )
    : resolve(base, id);
  return {
    path,
    base: dirname(path),
    content: readFileSync(path, 'utf8'),
  };
}

/**
 * `compile()` is incremental: a compiler keeps every candidate it has been
 * given, so a second build() reports the first build's bytes too. Each
 * measurement therefore gets its own compiler.
 */
async function compileWith(candidates: string[]): Promise<string> {
  const compiler = await compile(
    readFileSync(join(SRC, 'globals.css'), 'utf8'),
    { base: SRC, loadStylesheet },
  );
  return compiler.build(candidates);
}

/** `hover:bg-theme` -> `.hover\:bg-theme`, the selector Tailwind writes. */
function escapeClass(name: string): string {
  return `.${name.replace(/[.:/[\]()!%,]/g, (char) => `\\${char}`)}`;
}

/** How many rules in `css` target exactly this class. */
function ruleCount(css: string, name: string): number {
  const selector = escapeClass(name);
  let count = 0;
  let at = css.indexOf(selector);
  while (at !== -1) {
    const next = css[at + selector.length] ?? '';
    // `.bg-theme` must not match inside `.bg-theme-primary`.
    if (!/[a-zA-Z0-9_-]/.test(next)) count += 1;
    at = css.indexOf(selector, at + 1);
  }
  return count;
}

describe('theme classes', () => {
  const sites = classLiterals();
  const candidates = themeCandidates(sites);

  it('the harness sees ordinary Tailwind classes emit', async () => {
    const baseline = (await compileWith([])).length;
    for (const control of CONTROLS) {
      expect((await compileWith([control])).length).toBeGreaterThan(baseline);
    }
    expect(candidates.length).toBeGreaterThan(20);
  });

  it('every theme class the components write produces CSS', async () => {
    const baseline = await compileWith([]);
    const dead: string[] = [];

    for (const candidate of candidates) {
      const generated =
        (await compileWith([candidate])).length > baseline.length;
      const authored = ruleCount(baseline, candidate) > 0;
      if (!generated && !authored) dead.push(candidate);
    }

    const unexpected = dead.filter((name) => !(name in KNOWN_UNREGISTERED));
    expect(
      unexpected.map((name) => `${name} (${sites.get(name)?.join(', ')})`),
    ).toEqual([]);
  });

  it('every allowlisted class is genuinely dead', async () => {
    const baseline = await compileWith([]);
    const alive: string[] = [];

    for (const name of Object.keys(KNOWN_UNREGISTERED)) {
      const generated = (await compileWith([name])).length > baseline.length;
      const authored = ruleCount(baseline, name) > 0;
      if (generated || authored) alive.push(name);
    }

    expect(alive).toEqual([]);
  });

  it('no theme class is both generated and hand-written', async () => {
    const baseline = await compileWith([]);
    const duplicated: string[] = [];

    for (const candidate of candidates) {
      const authored = ruleCount(baseline, candidate);
      if (authored === 0) continue;
      const withCandidate = await compileWith([candidate]);
      if (withCandidate.length > baseline.length) {
        duplicated.push(candidate);
        continue;
      }
      // A rule that survives a namespace registration would win over the
      // generated utility, because components.css is unlayered.
      if (ruleCount(withCandidate, candidate) > authored) {
        duplicated.push(candidate);
      }
    }

    expect(duplicated).toEqual([]);
  });
});
