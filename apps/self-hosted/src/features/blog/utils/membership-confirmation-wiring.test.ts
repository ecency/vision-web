import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The join button must use the confirmation policy, and must not fake it.
 *
 * The policy itself is pure and tested next door. What cannot be tested that
 * way is the component that drives it, because nothing in `apps/self-hosted` is
 * DOM-testable, so the properties that matter are asserted against the source:
 * it goes through the policy, it never writes the answer into the cache itself,
 * the control stays disabled for as long as the answer is unknown, the way out
 * of the unconfirmed state cannot broadcast, and both outcomes are announced.
 *
 * Everything here is read off the syntax tree. An earlier version located the
 * re-check by slicing between two `indexOf` results, which returns an empty
 * string the moment either literal moves or is renamed, and an empty string
 * matches no forbidden pattern, so the guard passed by evaporating. The
 * analysis functions are exercised against synthetic sources at the bottom so
 * that failure mode is demonstrated to be closed rather than asserted to be.
 */

const JOIN_BUTTON = join(
  __dirname,
  '..',
  'components',
  'community-join-button.tsx',
);

function parseSource(code: string, name = 'probe.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    name,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

const sf = parseSource(readFileSync(JOIN_BUTTON, 'utf8'), JOIN_BUTTON);

function importedBindings(source: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const named = node.importClause.namedBindings;
      if (ts.isNamedImports(named)) {
        for (const element of named.elements) {
          if (element.propertyName) bindings.add(element.propertyName.text);
          bindings.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bindings;
}

function calledNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      names.add(
        ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : callee.getText(source),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** The `disabled` expression of every `<button>` in the file. */
function buttonDisabledExpressions(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === 'button'
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source) === 'disabled' &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        ) {
          found.push(attribute.initializer.expression.getText(source));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The declaration of a top-level `const <name> = ...`, or null.
 *
 * Returning null rather than an empty region is the whole point: a handler this
 * cannot find is a handler it cannot clear, and the caller asserts on the null
 * before asserting on the contents.
 */
function declarationNamed(
  source: ts.SourceFile,
  name: string,
): ts.VariableDeclaration | null {
  let found: ts.VariableDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every call inside one declaration's own subtree. */
function callsWithin(source: ts.SourceFile, node: ts.Node): string[] {
  const calls: string[] = [];
  const visit = (current: ts.Node) => {
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      calls.push(
        ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : callee.getText(source),
      );
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return calls;
}

interface LiveRegionUse {
  /** The `message` expression, so an always-null region is visible. */
  message: string | undefined;
  /** Conditions this element renders under; a live region must have none. */
  conditions: string[];
}

function liveRegions(source: ts.SourceFile): LiveRegionUse[] {
  const found: LiveRegionUse[] = [];

  const conditionsAbove = (node: ts.Node): string[] => {
    const conditions: string[] = [];
    let current: ts.Node | undefined = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isConditionalExpression(current)) {
        conditions.push(current.condition.getText(source));
      } else if (
        ts.isBinaryExpression(current) &&
        (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          current.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        conditions.push(current.left.getText(source));
      }
      current = current.parent;
    }
    return conditions;
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === 'LiveRegion'
    ) {
      let message: string | undefined;
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source) === 'message' &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        ) {
          message = attribute.initializer.expression.getText(source);
        }
      }
      found.push({ message, conditions: conditionsAbove(node) });
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

describe('the join button confirms rather than assumes', () => {
  it('goes through the bounded confirmation policy', () => {
    const bindings = importedBindings(sf);
    expect(bindings).toContain('nextConfirmationStep');
    expect(bindings).toContain('MEMBERSHIP_CONFIRMATION');
  });

  it('reads the community back rather than trusting the broadcast', () => {
    // A subscribe resolves on mempool acceptance, so nothing is known until the
    // community itself answers.
    expect(calledNames(sf)).toContain('refetch');
  });

  it('never writes the outcome into the cache itself', () => {
    // An optimistic write is the same claim as an optimistic label, made
    // somewhere harder to see: it would show "Leave" for a join that never
    // landed, and every other reader of this query key would believe it.
    const calls = calledNames(sf);
    for (const forbidden of [
      'setQueryData',
      'setQueriesData',
      'setQueryDefaults',
    ]) {
      expect(calls, `${forbidden} would fabricate a membership`).not.toContain(
        forbidden,
      );
    }
  });

  it('keeps the action disabled while the outcome is unknown', () => {
    // Both states: while the community is being polled, and after the budget
    // ran out. Re-enabling in either offers the reader the one action that
    // produces a duplicate broadcast.
    const [primary] = buttonDisabledExpressions(sf);
    expect(primary).toBeDefined();
    expect(primary).toMatch(/busy/);
    expect(primary).toMatch(/unconfirmed/);
  });

  it('offers a re-check that cannot broadcast', () => {
    // The way out of the unconfirmed state is another read, never another
    // custom_json.
    const handler = declarationNamed(sf, 'handleCheckAgain');
    expect(handler, 'handleCheckAgain is gone or renamed').not.toBeNull();

    const calls = callsWithin(sf, handler as unknown as ts.Node);
    expect(calls).toContain('confirm');
    expect(calls).not.toContain('mutateAsync');
    expect(calls).not.toContain('mutate');
  });

  it('cannot leave the run stuck when a read fails', () => {
    // A rejected refetch used to escape the loop, leaving the button in
    // `confirming` forever, disabled, with nothing to press.
    const confirmFn = declarationNamed(sf, 'confirm');
    expect(confirmFn, 'confirm is gone or renamed').not.toBeNull();

    let hasCatch = false;
    const visit = (node: ts.Node) => {
      if (ts.isTryStatement(node) && node.catchClause) {
        const guarded = callsWithin(sf, node.tryBlock);
        if (guarded.includes('refetch')) hasCatch = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(confirmFn as unknown as ts.Node);

    expect(hasCatch, 'the read inside the confirmation loop is unguarded').toBe(
      true,
    );
  });

  it('announces both outcomes, from regions that are always mounted', () => {
    const regions = liveRegions(sf);
    // One for the unconfirmed ending, one for the broadcast error.
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      // A live region created at the same moment as its first message is
      // usually not announced at all, so it must not be conditionally rendered.
      expect(region.conditions, region.message).toEqual([]);
      expect(region.message).toBeDefined();
    }
  });
});

describe('the guard catches the ways around it', () => {
  it('returns null for a handler it cannot find', () => {
    // The hole: the re-check was located by slicing between two indexOf
    // results. Either literal moving returned -1, slice returned '', and an
    // empty string matches no forbidden pattern, so the assertion passed
    // without reading any code at all.
    const renamed = parseSource('const somethingElse = () => {};');
    expect(declarationNamed(renamed, 'handleCheckAgain')).toBeNull();
  });

  it('reads a broadcast back out of the re-check handler', () => {
    const bad = parseSource(
      'const handleCheckAgain = async () => { await subscribe.mutateAsync({ community: c }); };',
    );
    const handler = declarationNamed(bad, 'handleCheckAgain');
    expect(handler).not.toBeNull();
    expect(callsWithin(bad, handler as unknown as ts.Node)).toContain(
      'mutateAsync',
    );
  });

  it('does not see a broadcast in a handler that only reads', () => {
    const good = parseSource(
      'const handleCheckAgain = async () => { await confirm(desired); };',
    );
    const handler = declarationNamed(good, 'handleCheckAgain');
    expect(callsWithin(good, handler as unknown as ts.Node)).toEqual([
      'confirm',
    ]);
  });

  it('catches an aliased import of the policy', () => {
    const aliased = parseSource(
      "import { nextConfirmationStep as step } from '../utils/membership-confirmation';",
    );
    expect(importedBindings(aliased)).toContain('nextConfirmationStep');
  });

  it('sees a conditionally rendered live region', () => {
    const late = parseSource(
      'export const A = () => <div>{failed && <LiveRegion message={msg} />}</div>;',
    );
    const [region] = liveRegions(late);
    expect(region.conditions).toContain('failed');
  });

  it('sees an always-mounted live region as unconditional', () => {
    const good = parseSource(
      'export const A = () => <div><LiveRegion message={failed ? msg : null} /></div>;',
    );
    const [region] = liveRegions(good);
    expect(region.conditions).toEqual([]);
    expect(region.message).toBe('failed ? msg : null');
  });

  it('sees an unguarded read inside a loop', () => {
    const unguarded = parseSource(
      'const confirm = async () => { for (;;) { const r = await refetch(); } };',
    );
    const fn = declarationNamed(unguarded, 'confirm');
    let hasCatch = false;
    const visit = (node: ts.Node) => {
      if (ts.isTryStatement(node) && node.catchClause) {
        if (callsWithin(unguarded, node.tryBlock).includes('refetch')) {
          hasCatch = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(fn as unknown as ts.Node);
    expect(hasCatch).toBe(false);
  });
});
