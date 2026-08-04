import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * "Not configurable" as a CI fact rather than a code-review promise.
 *
 * The three disclosures have no config key, and the only way to keep that true
 * through later refactors is to forbid the wiring that would undo it. Nothing
 * in `apps/self-hosted` is DOM-testable (`environment: 'node'`,
 * `include: ['src/**\/*.test.ts']`), so a source scan is the only guarantee
 * available here at all.
 *
 * Modelled on `src/routes/-internal-links.test.ts`, which already reads files
 * off disk and drives the TypeScript compiler API; `typescript` is a
 * devDependency.
 */

const SRC = join(__dirname, '..', '..');

const DISCLOSURE_MODULE = 'features/shared/hive-disclosure.tsx';

/**
 * Bindings that would let the disclosure module read the Hive layer.
 *
 * Asserted on the imported BINDINGS, not on the module path. The resolver is
 * re-exported from the `@/core` barrel and every component imports `t` from
 * there, so a path-substring check would pass on exactly the wiring it exists
 * to forbid: `import { t, resolveHiveLayer } from '@/core'` contains no
 * 'hive-layer' anywhere.
 */
const FORBIDDEN_BINDINGS = new Set([
  'resolveHiveLayer',
  'useHiveLayer',
  'ResolvedHiveLayer',
  'HiveLayerInput',
  'HIVE_LAYER_CONFIG_DEFAULTS',
  'HIVE_LAYER_SEED',
  'ReaderLayer',
  'AuthorRewards',
  'resolveCommentOptions',
  // Reading config directly would be the same capability by another route.
  'InstanceConfigManager',
]);

/** Where each disclosure has to be rendered, and under what name. */
const CALL_SITES: Record<string, string> = {
  'features/auth/components/comment-form.tsx': 'CommentDisclosure',
  'features/publish/components/publish-action-bar.tsx': 'PublishDisclosure',
  // The spec places the vote disclosure on the vote button itself. It renders
  // in the post footer instead: `@ecency/ui`'s VoteButton is consumed from a
  // committed dist, so a new prop added in its source would not reach the app,
  // and the picker the spec puts the visible label on is not built yet. The
  // requirement the floor actually states is visible inline text next to the
  // action, which this is.
  'features/blog/components/blog-post-footer.tsx': 'VoteDisclosure',
};

function parseSource(code: string, name = 'probe.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    name,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function parse(relative: string): ts.SourceFile {
  const path = join(SRC, relative);
  return parseSource(readFileSync(path, 'utf8'), path);
}

interface Imported {
  specifier: string;
  /**
   * Both names an import introduces: what was exported, and what it is called
   * here. `import { resolveHiveLayer as layer }` is the resolver under a name
   * no list of forbidden bindings would think to contain, so recording only
   * the local name let exactly that through. Recording only the exported name
   * would miss the mirror image, a local name that happens to collide with a
   * forbidden one, so both are kept and both are checked.
   */
  bindings: string[];
}

function importsOf(sf: ts.SourceFile): Imported[] {
  const found: Imported[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const bindings: string[] = [];
      const clause = node.importClause;
      if (clause?.name) bindings.push(clause.name.text);
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            // propertyName is set only on an aliased import, and is the name
            // the module actually exported.
            if (element.propertyName) bindings.push(element.propertyName.text);
            bindings.push(element.name.text);
          }
        } else {
          // `import * as x` re-exposes everything, so the binding name is not
          // enough to tell what is reachable. Recorded as a wildcard.
          bindings.push('*');
        }
      }
      found.push({ specifier: node.moduleSpecifier.text, bindings });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Every JSX element in the file with the given tag name. */
function jsxElements(sf: ts.SourceFile, tag: string): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === tag
    ) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * The text of every condition this node renders under.
 *
 * A disclosure wrapped in `{hiveLayer.showChainNote && <CommentDisclosure />}`
 * would be configurable in practice while still being imported, which is
 * exactly the failure an import-only check would miss.
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

/** Everything a file pulls in that would let it read the Hive layer. */
function forbiddenBindingsIn(sf: ts.SourceFile): string[] {
  return importsOf(sf).flatMap((entry) =>
    entry.bindings.filter((binding) => FORBIDDEN_BINDINGS.has(binding)),
  );
}

describe('the disclosure floor has no way to be switched off', () => {
  const module = parse(DISCLOSURE_MODULE);
  const moduleImports = importsOf(module);

  it('imports nothing from the Hive layer resolver', () => {
    expect(forbiddenBindingsIn(module)).toEqual([]);
  });

  it('imports nothing from a hive-layer module by path either', () => {
    const paths = moduleImports
      .map((entry) => entry.specifier)
      .filter((specifier) => specifier.includes('hive-layer'));
    expect(paths).toEqual([]);
  });

  it('does not pull the whole barrel in as a namespace', () => {
    // `import * as core` would make every forbidden binding reachable under a
    // name this test cannot see.
    const wildcards = moduleImports.filter((entry) =>
      entry.bindings.includes('*'),
    );
    expect(wildcards).toEqual([]);
  });

  it.each(Object.entries(CALL_SITES))(
    '%s imports and renders %s',
    (relative, component) => {
      const sf = parse(relative);
      const fromDisclosure = importsOf(sf).filter(
        (entry) =>
          entry.specifier.includes('hive-disclosure') &&
          entry.bindings.includes(component),
      );
      expect(fromDisclosure).toHaveLength(1);
      expect(jsxElements(sf, component)).toHaveLength(1);
    },
  );

  it.each(Object.entries(CALL_SITES))(
    '%s renders %s without a Hive-layer condition',
    (relative, component) => {
      const sf = parse(relative);
      const [element] = jsxElements(sf, component);
      const gated = enclosingConditions(element, sf).filter((condition) =>
        /hiveLayer|resolveHiveLayer|useHiveLayer|readerLayer/.test(condition),
      );
      expect(gated).toEqual([]);
    },
  );
});

describe('the guard catches the ways around it', () => {
  const from = (code: string) => parseSource(code);

  it('passes a module that only imports what it should', () => {
    expect(forbiddenBindingsIn(from("import { t } from '@/core';"))).toEqual(
      [],
    );
  });

  it('catches the resolver imported under another name', () => {
    // The hole: only the LOCAL name was recorded, so an alias was a name no
    // list of forbidden bindings would ever contain, and the resolver was
    // fully reachable through it.
    expect(
      forbiddenBindingsIn(
        from("import { resolveHiveLayer as layer } from '@/core';"),
      ),
    ).toContain('resolveHiveLayer');
  });

  it.each([
    ["import { useHiveLayer as h } from '@/core';", 'useHiveLayer'],
    [
      "import { t, HIVE_LAYER_CONFIG_DEFAULTS as d } from '@/core';",
      'HIVE_LAYER_CONFIG_DEFAULTS',
    ],
    [
      "import type { ResolvedHiveLayer as L } from '@/core';",
      'ResolvedHiveLayer',
    ],
    [
      "import { InstanceConfigManager as cfg } from '@/core';",
      'InstanceConfigManager',
    ],
  ])('catches %s', (code, expected) => {
    expect(forbiddenBindingsIn(from(code))).toContain(expected);
  });

  it('still catches an unaliased import', () => {
    expect(
      forbiddenBindingsIn(from("import { resolveHiveLayer } from '@/core';")),
    ).toContain('resolveHiveLayer');
  });

  it('catches a local name that collides with a forbidden one', () => {
    // The mirror image: recording only the exported name would let a local
    // `resolveHiveLayer` bound to some other export through.
    expect(
      forbiddenBindingsIn(
        from("import { somethingElse as resolveHiveLayer } from './x';"),
      ),
    ).toContain('resolveHiveLayer');
  });

  it('catches a namespace import, which hides every name', () => {
    const wildcards = importsOf(from("import * as core from '@/core';"));
    expect(wildcards[0].bindings).toContain('*');
  });

  it('reads a Hive-layer condition wrapped around a disclosure', () => {
    const sf = from(
      'export const A = () => <div>{hiveLayer.showChainNote && <CommentDisclosure />}</div>;',
    );
    const [element] = jsxElements(sf, 'CommentDisclosure');
    expect(enclosingConditions(element, sf)).toContain(
      'hiveLayer.showChainNote',
    );
  });

  it('does not read the auth and likes gates as Hive-layer conditions', () => {
    // features.likes and features.auth already decide whether the action
    // exists at all, so gating on them is allowed and must not be reported.
    const sf = from(
      'export const A = () => <div>{showLikes && isAuthEnabled && <VoteDisclosure />}</div>;',
    );
    const [element] = jsxElements(sf, 'VoteDisclosure');
    const gated = enclosingConditions(element, sf).filter((condition) =>
      /hiveLayer|resolveHiveLayer|useHiveLayer|readerLayer/.test(condition),
    );
    expect(gated).toEqual([]);
  });
});

/**
 * The composer's reward panel makes the same kind of promise as the floor
 * above, one step further in: it is shown only where the instance asked for
 * it, but once shown it always states the split about to be broadcast and that
 * the split cannot be changed afterwards. A `comment_options` operation is
 * written once and no edit reaches it, so those two lines are not allowed to
 * become conditional on the selection, on the posture, or on anything else.
 *
 * Checked here rather than in the panel's own test because there is no such
 * thing: `include: ['src/**\/*.test.ts']` means no `.tsx` in this app is
 * rendered by any test, so the syntax tree is the strongest statement
 * available.
 */
const REWARD_PANEL = 'features/publish/components/publish-reward-selector.tsx';
const REWARD_PANEL_HOST =
  'features/publish/components/publish-action-bar.tsx';

/** Every `t('key')` call in the file, with the key it was given. */
function translationCalls(
  sf: ts.SourceFile,
): { key: string; node: ts.Node }[] {
  const found: { key: string; node: ts.Node }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === 't' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push({ key: node.arguments[0].text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('the composer states what it is about to broadcast', () => {
  const panel = parse(REWARD_PANEL);

  it.each(['reward_split_broadcast', 'reward_split_permanent'])(
    'prints %s unconditionally',
    (key) => {
      const calls = translationCalls(panel).filter(
        (call) => call.key === key,
      );
      expect(calls, `${key} is never printed`).toHaveLength(1);
      // Any condition at all, not only a Hive-layer one: an author who leaves
      // the selection alone still gets told what their post pays.
      expect(enclosingConditions(calls[0].node, panel)).toEqual([]);
    },
  );

  it('prints the split for the selection actually held', () => {
    // A hardcoded split would read as a statement of fact while the select
    // said something else. The printed label has to be looked up from the
    // current value, and that lookup must not sit under a condition either.
    const lookups: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isElementAccessExpression(node) &&
        node.expression.getText(panel) === 'OPTION_LABELS' &&
        node.argumentExpression.getText(panel) === 'value'
      ) {
        lookups.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(panel);

    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) {
      expect(enclosingConditions(lookup, panel)).toEqual([]);
    }
  });

  it('is shown exactly where the instance asked for it', () => {
    // The panel itself is conditional, and this is the one condition it may
    // carry: the resolved posture, which the resolver has already clamped to
    // off for an external composer.
    const host = parse(REWARD_PANEL_HOST);
    const [element] = jsxElements(host, 'PublishRewardSelector');
    expect(element, 'the reward panel is not rendered at all').toBeDefined();

    const conditions = enclosingConditions(element, host);
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain('authorRewards');
  });
});
