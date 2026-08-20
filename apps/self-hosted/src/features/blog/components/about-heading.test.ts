import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A source guard for one rule: the About page has a heading in every outcome.
 *
 * The page sits under a newsletter section whose own heading is an h2
 * (vision-web#1551). Three of the four shells carry a masthead h1 of their own,
 * DefaultShell through BlogNavigation and journal and terminal directly, but
 * the reader shell renders its title in a span. So on that template, any About
 * outcome that skipped the page heading left the document starting at h2, which
 * is exactly what the loading and failure branches used to do: they returned a
 * bare line of text.
 *
 * Both variants now return through `AboutFrame`, which owns the h1, and the
 * identity it needs comes from config rather than from the request. Checked in
 * the source because the branch that regresses is a loading state behind a
 * query, and the same approach as `failure-states.test.ts` next door.
 */

const FILE = join(__dirname, 'about-page.tsx');
/** Every one of these must return through the frame, in every branch. */
const VARIANTS = ['BlogAbout', 'CommunityAbout'];
const FRAME = 'AboutFrame';

function parse(): ts.SourceFile {
  return ts.createSourceFile(
    FILE,
    readFileSync(FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function each(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => each(child, visit));
}

/**
 * The return statements belonging to this function itself, not to callbacks
 * nested inside it: a `useMemo(() => ...)` return is not what the component
 * renders.
 */
function ownReturns(fn: ts.Node): ts.ReturnStatement[] {
  const out: ts.ReturnStatement[] = [];
  const walk = (node: ts.Node) => {
    ts.forEachChild(node, (child) => {
      if (
        ts.isArrowFunction(child) ||
        ts.isFunctionExpression(child) ||
        ts.isFunctionDeclaration(child)
      ) {
        return;
      }
      if (ts.isReturnStatement(child)) out.push(child);
      walk(child);
    });
  };
  walk(fn);
  return out;
}

function functionNamed(source: ts.SourceFile, name: string): ts.Node {
  let found: ts.Node | undefined;
  each(source, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
  });
  if (!found) throw new Error(`${name} is no longer a function declaration`);
  return found;
}

/** The tag name of a returned JSX element, or null for anything else. */
function returnedTag(statement: ts.ReturnStatement): string | null {
  const expr = statement.expression;
  if (!expr) return null;
  const jsx = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
  if (ts.isJsxElement(jsx)) return jsx.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(jsx)) return jsx.tagName.getText();
  return null;
}

describe('the About page always has a heading', () => {
  const source = parse();

  it.each(VARIANTS)('%s returns through the frame in every branch', (name) => {
    // The component's OWN returns. Descending into nested functions would
    // collect the `useMemo` callbacks' returns, which are not what renders.
    const returns = ownReturns(functionNamed(source, name));

    // Loading, failed and success. If a branch is ever added, it is covered by
    // the same assertion rather than needing a new case here.
    expect(returns.length).toBeGreaterThanOrEqual(3);
    expect(returns.map(returnedTag)).toEqual(returns.map(() => FRAME));
  });

  it('the frame is the one place the page heading lives', () => {
    const text = readFileSync(FILE, 'utf8');
    // Exactly one, and it is inside the frame: two would give the page two
    // titles in the success state, none would put us back where we started.
    expect(text.match(/<h1[\s>]/g)?.length).toBe(1);

    let headings = 0;
    each(functionNamed(source, FRAME), (n) => {
      if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'h1') {
        headings += 1;
      }
    });
    expect(headings).toBe(1);
  });
});
