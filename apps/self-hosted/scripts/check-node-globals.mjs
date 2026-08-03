#!/usr/bin/env node
/**
 * Fail the build when an emitted chunk reads a Node global unguarded.
 *
 * This app is bundled by Rsbuild, which provides no `process`, `Buffer` or
 * `__dirname`. Next.js does provide them, so a dependency that reads one is
 * green on ecency.com and fatal here: the chunk throws at load, before any app
 * code runs, and every hosted blog renders blank with nothing in the server
 * logs to explain it.
 *
 * That has now shipped twice. `Buffer.from()` in render-helper was the first.
 * The second was the npm `assert` polyfill, pulled in by `hive-auth-wrapper`,
 * which reads `process.emitWarning` and `process.stderr`.
 *
 * Feature detection is the normal, correct pattern and must keep passing, and
 * the detection is often on a SIBLING capability rather than on the global
 * itself:
 *
 *   typeof process !== "undefined" && process.versions       <- allowed
 *   typeof btoa > "u" && (g.btoa = () => Buffer.from(...))   <- allowed, sibling guard
 *   typeof TextEncoder > "u" ? enc() : Buffer.from(...)      <- allowed, sibling guard
 *   process.emitWarning ? process.emitWarning : console.warn <- rejected
 *   typeof window; process.stderr.write(x)                   <- rejected, guard does not govern
 *
 * The distinction is whether a `typeof` test actually GOVERNS the read, so this
 * walks the syntax tree rather than looking at nearby text. A previous version
 * matched on proximity and accepted the last line above, which is exactly the
 * failure it exists to catch.
 *
 * References are found by identifier, not by member access, so `Buffer(x)`,
 * `new Buffer(x)`, `process?.env` and a bare `__dirname` are all caught.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const DIST = join(import.meta.dirname, '..', 'dist', 'static', 'js');
const GLOBALS = new Set(['process', 'Buffer', '__dirname', '__filename']);

/** True when this identifier is a real value read rather than a name that merely looks like one. */
function isValueReference(node) {
  const parent = node.parent;
  if (!parent) return true;

  // obj.process — the property, not the global.
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  // { process: 1 } and { process } shorthand keys.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isShorthandPropertyAssignment(parent)) return false;
  // Declarations and bindings that introduce a local of the same name.
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) {
    if (parent.name === node) return false;
  }
  if (ts.isBindingElement(parent)) return false;
  // class { process(e, t) {} } and { get process() {} } are member names, and a
  // minified hash implementation really does define a method called `process`.
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return false;
  if (ts.isGetAccessorDeclaration(parent) && parent.name === node) return false;
  if (ts.isSetAccessorDeclaration(parent) && parent.name === node) return false;
  if (ts.isMethodSignature(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
    if (parent.name === node) return false;
  }
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  // typeof process is the guard itself, never the hazard.
  if (ts.isTypeOfExpression(parent)) return false;

  return true;
}

/** True when any `typeof` appears inside this subtree. */
function containsTypeOf(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isTypeOfExpression(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/**
 * True when a `typeof` test governs this node.
 *
 * Governing means the node sits in the branch a typeof condition selects: the
 * branches of a conditional or an if, or the right side of && / ||. Being merely
 * near a typeof is not enough, which is the whole point.
 */
function isGuarded(node) {
  let child = node;
  let parent = node.parent;

  while (parent) {
    if (ts.isConditionalExpression(parent)) {
      if ((child === parent.whenTrue || child === parent.whenFalse) && containsTypeOf(parent.condition)) {
        return true;
      }
    } else if (ts.isIfStatement(parent)) {
      if ((child === parent.thenStatement || child === parent.elseStatement) && containsTypeOf(parent.expression)) {
        return true;
      }
    } else if (ts.isBinaryExpression(parent)) {
      const kind = parent.operatorToken.kind;
      const isLogical =
        kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken;
      if (isLogical && child === parent.right && containsTypeOf(parent.left)) {
        return true;
      }
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

function scan(source, fileName) {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const hits = [];

  const visit = (node) => {
    if (ts.isIdentifier(node) && GLOBALS.has(node.text) && isValueReference(node) && !isGuarded(node)) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      hits.push({
        name: node.text,
        line: line + 1,
        excerpt: source.slice(Math.max(0, node.getStart(tree) - 90), node.getStart(tree) + 70),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
}

let files;
try {
  files = readdirSync(DIST).filter((name) => name.endsWith('.js'));
} catch {
  console.error(`[node-globals] no build output at ${DIST}; run the build first`);
  process.exit(2);
}

if (files.length === 0) {
  console.error('[node-globals] build output contains no JS; refusing to pass vacuously');
  process.exit(2);
}

let failures = 0;
for (const name of files) {
  for (const hit of scan(readFileSync(join(DIST, name), 'utf8'), name)) {
    failures += 1;
    if (failures <= 20) {
      console.error(
        `[node-globals] ${name}:${hit.line}: unguarded ${hit.name}\n  ...${hit.excerpt.replace(/\n/g, ' ')}`
      );
    }
  }
}

if (failures > 0) {
  if (failures > 20) console.error(`[node-globals] ... and ${failures - 20} more`);
  console.error(
    `\n[node-globals] ${failures} unguarded reference(s). This throws at chunk load in the browser and blanks every instance.\n` +
      'Alias the offending module to a browser-safe shim (see src/shims/assert.ts) rather than defining the global.'
  );
  process.exit(1);
}

console.log(`[node-globals] ${files.length} chunk(s) clean`);
