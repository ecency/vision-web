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

function parse(relative: string): ts.SourceFile {
  const path = join(SRC, relative);
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

interface Imported {
  specifier: string;
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

describe('the disclosure floor has no way to be switched off', () => {
  const module = parse(DISCLOSURE_MODULE);
  const moduleImports = importsOf(module);

  it('imports nothing from the Hive layer resolver', () => {
    const reachable = moduleImports.flatMap((entry) =>
      entry.bindings.filter((binding) => FORBIDDEN_BINDINGS.has(binding)),
    );
    expect(reachable).toEqual([]);
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
