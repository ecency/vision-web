import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The join button must use the confirmation policy, and must not fake it.
 *
 * The policy itself is pure and tested next door. What cannot be tested that
 * way is the component that drives it, because nothing in `apps/self-hosted` is
 * DOM-testable, so the three properties that matter are asserted against the
 * source: it goes through the policy, it never writes the answer into the cache
 * itself, and the control stays disabled for as long as the answer is unknown.
 */

const JOIN_BUTTON = join(
  __dirname,
  '..',
  'components',
  'community-join-button.tsx',
);

const source = readFileSync(JOIN_BUTTON, 'utf8');
const sf = ts.createSourceFile(
  JOIN_BUTTON,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function importedBindings(): Set<string> {
  const bindings = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const named = node.importClause.namedBindings;
      if (ts.isNamedImports(named)) {
        for (const element of named.elements) bindings.add(element.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bindings;
}

function calledNames(): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      names.add(
        ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : callee.getText(sf),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** The `disabled` expression of every `<button>` in the file. */
function buttonDisabledExpressions(): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === 'button'
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(sf) === 'disabled' &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        ) {
          found.push(attribute.initializer.expression.getText(sf));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('the join button confirms rather than assumes', () => {
  it('goes through the bounded confirmation policy', () => {
    const bindings = importedBindings();
    expect(bindings).toContain('nextConfirmationStep');
    expect(bindings).toContain('MEMBERSHIP_CONFIRMATION');
  });

  it('reads the community back rather than trusting the broadcast', () => {
    // A subscribe resolves on mempool acceptance, so nothing is known until the
    // community itself answers.
    expect(calledNames()).toContain('refetch');
  });

  it('never writes the outcome into the cache itself', () => {
    // An optimistic write is the same claim as an optimistic label, made
    // somewhere harder to see: it would show "Leave" for a join that never
    // landed, and every other reader of this query key would believe it.
    const calls = calledNames();
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
    const [primary] = buttonDisabledExpressions();
    expect(primary).toBeDefined();
    expect(primary).toMatch(/busy/);
    expect(primary).toMatch(/unconfirmed/);
  });

  it('offers a re-check that cannot broadcast', () => {
    // The way out of the unconfirmed state is another read, never another
    // custom_json.
    expect(source).toContain('handleCheckAgain');
    const checkAgain = source.slice(
      source.indexOf('const handleCheckAgain'),
      source.indexOf('if (!isAuthEnabled'),
    );
    expect(checkAgain).not.toMatch(/mutateAsync|mutate\(/);
  });
});
