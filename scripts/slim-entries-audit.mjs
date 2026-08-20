// Slim-entry convention audit (apps/web/src/core/entries/slim-entry.ts).
//
// There are two wrappers, and the rule is that each goes with one kind of
// builder:
//
//   withSlimPageEntries(...)  SINGLE-PAGE builders (getPostsRankedQueryOptions,
//                             getAccountPostsQueryOptions). It gives the slim
//                             page its own cache identity, because the SDK's
//                             page keys are also read by the deck columns, which
//                             render entry.body from what they find there. A
//                             slim page under the shared key reaches a deck
//                             inside the staleTime and its post viewer renders
//                             an empty article. That was issue #1556.
//
//   withSlimEntries(...)      INFINITE builders and the promoted feed, whose key
//                             must stay exactly what the SDK produced: the feed
//                             poll hand-builds that key for its setQueryData
//                             merge, so an extra marker would write the merge to
//                             a key nothing renders.
//
// This used to be one function with an { isolateKey } flag, which meant the
// dangerous mistake was an omission — and an omission is exactly what an AST
// rule is worst at seeing. Two names make the wrong thing unrepresentable
// rather than merely detectable, and leave this audit a backstop for picking
// the wrong name.
//
// WHAT THIS CANNOT SEE, deliberately, rather than pretending otherwise:
// it matches on identifier text, so a wrapper or builder renamed through an
// import alias, a re-export or a local const is invisible to it. That is fine
// for what it is: a guard against an accident, not against someone working
// around it. Anything it cannot classify it REPORTS, so silence means it
// understood the code, not that it gave up.
//
// CI runs with --fail: any finding exits 1.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export const SINGLE_PAGE_BUILDERS = new Set([
  "getPostsRankedQueryOptions",
  "getAccountPostsQueryOptions"
]);
export const INFINITE_BUILDERS = new Set([
  "getPostsRankedInfiniteQueryOptions",
  "getAccountPostsInfiniteQueryOptions"
]);

/** The identifier being called, for both `f()` and `ns.f()`. */
function calleeName(node) {
  if (!node || !ts.isCallExpression(node)) return null;
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) return e.name.text;
  return null;
}

/**
 * Nodes that introduce a scope a `const` can live in. A declaration inside any
 * of these is invisible from outside it, so resolution must neither descend into
 * one nor stop short of the enclosing ones.
 */
function isScopeNode(node) {
  return (
    isScopeBoundary(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isModuleBlock(node)
  );
}

/** Function-like nodes, where an outer name can still be seen but a local one wins. */
function isScopeBoundary(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isSourceFile(node)
  );
}

/**
 * Local name -> the name it was imported from. Module scope, which is what an
 * import is. Local `const a = b` aliases are NOT collected here: they belong to
 * the scope that declares them, and folding them into one file-wide map let a
 * nested `const build = ...` overwrite an outer `import { x as build }` and hide
 * a violation at the outer call site.
 */
function importAliases(src) {
  const aliases = new Map();
  (function visit(node) {
    if (ts.isImportSpecifier(node) && node.propertyName) {
      aliases.set(node.name.text, node.propertyName.text);
    }
    ts.forEachChild(node, visit);
  })(src);
  return aliases;
}

/**
 * The name behind `name` as seen FROM `node`: a local `const name = other` in
 * the nearest enclosing scope wins over an import alias, exactly as it does at
 * runtime. Returns null when the name is declared more than once in a scope, or
 * bound by something this cannot read.
 */
function canonicalAt(node, name, imports, seen = new Set()) {
  if (!name || seen.has(name)) return name ?? null;
  seen.add(name);

  for (let scope = node; scope; scope = scope.parent) {
    if (!isScopeNode(scope)) continue;
    const bindings = bindingsIn(scope, name);
    if (bindings.length === 1) {
      const init = bindings[0];
      if (init && ts.isIdentifier(init)) return canonicalAt(scope, init.text, imports, seen);
      return null;
    }
    if (bindings.length > 1) return null;
  }

  let current = name;
  while (imports.has(current) && !seen.has(imports.get(current))) {
    current = imports.get(current);
    seen.add(current);
  }
  return current;
}

/**
 * Declarations of `name` belonging to THIS scope: not those in nested scopes,
 * which are invisible from here, and not those in enclosing ones, which the
 * caller reaches by walking outwards.
 *
 * Both resolvers share this. They used to collect separately and drifted apart,
 * each descending into child blocks and binding a name to a `const` declared in
 * an `if` branch that had already closed.
 */
function bindingsIn(scope, name) {
  const found = [];
  ts.forEachChild(scope, function walk(child) {
    if (child !== scope && isScopeNode(child)) return;
    if (
      ts.isVariableDeclaration(child) &&
      ts.isIdentifier(child.name) &&
      child.name.text === name
    ) {
      const isConst =
        ts.isVariableDeclarationList(child.parent) &&
        (child.parent.flags & ts.NodeFlags.Const) !== 0;
      // A `let` can hold something else by the time the call runs, and a
      // declaration with no initialiser says nothing at all.
      found.push(isConst && child.initializer ? child.initializer : null);
    }
    ts.forEachChild(child, walk);
  });
  return found;
}

/**
 * The builder behind an argument, following `const x = builder(...)` outwards
 * through real lexical scopes.
 *
 * Returns null when it cannot be determined, INCLUDING when a name has more than
 * one declaration in a scope. Guessing produced both misses and false failures
 * on correct code, and a rule that is sometimes wrong about correct code is one
 * people learn to ignore.
 */
function resolveBuilder(arg, imports) {
  const direct = calleeName(arg);
  if (direct) return canonicalAt(arg, direct, imports);
  if (!arg || !ts.isIdentifier(arg)) return null;

  for (let scope = arg.parent; scope; scope = scope.parent) {
    if (!isScopeNode(scope)) continue;
    const bindings = bindingsIn(scope, arg.text);
    if (bindings.length === 1) {
      const called = calleeName(bindings[0]);
      return called ? canonicalAt(scope, called, imports) : null;
    }
    if (bindings.length > 1) return null;
  }
  return null;
}

/** Findings for one source file. Exported so the audit itself can be tested. */
export function auditSource(fileName, text) {
  const src = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const findings = [];
  const imports = importAliases(src);

  (function visit(node) {
    const called = canonicalAt(node, calleeName(node), imports);
    if (called === "withSlimEntries" || called === "withSlimPageEntries") {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart());
      const where = `${fileName}:${line + 1}`;
      const wrapped = resolveBuilder(node.arguments[0], imports);

      if (!wrapped) {
        findings.push(
          `${where}  cannot tell which builder ${called} wraps — pass the builder ` +
            `call directly, or assign it to one clearly named const in the same function`
        );
      } else if (SINGLE_PAGE_BUILDERS.has(wrapped) && called !== "withSlimPageEntries") {
        findings.push(
          `${where}  ${wrapped} is a single-page builder: use withSlimPageEntries, ` +
            `or a deck column reading that page key renders an empty post`
        );
      } else if (INFINITE_BUILDERS.has(wrapped) && called !== "withSlimEntries") {
        findings.push(
          `${where}  ${wrapped} is an infinite builder: use withSlimEntries, ` +
            `its key is hand-built elsewhere for the feed poll's merge`
        );
      }
    }
    ts.forEachChild(node, visit);
  })(src);

  return findings;
}

function main() {
  const ROOT = new URL("..", import.meta.url).pathname;
  const failing = process.argv.includes("--fail");
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const s = statSync(p);
      if (s.isDirectory()) {
        if (e === "specs") continue;
        walk(p);
      } else if (/\.tsx?$/.test(e)) {
        files.push(p);
      }
    }
  })(join(ROOT, "apps/web/src"));

  const findings = files.flatMap((f) =>
    auditSource(relative(ROOT, f), readFileSync(f, "utf-8"))
  );

  if (findings.length === 0) {
    console.log(`slim-entries audit: ${files.length} files, no findings`);
    return 0;
  }
  console.log(`slim-entries audit: ${findings.length} finding(s)`);
  for (const f of findings) console.log(`  ${f}`);
  return failing ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
