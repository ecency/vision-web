// Slim-entry convention audit (apps/web/src/core/entries/slim-entry.ts).
//
// TypeScript-AST walk over apps/web/src. One rule, in both directions, about
// HOW a query is slimmed rather than whether it is:
//
//   i.  withSlimEntries() around a SINGLE-PAGE builder must pass
//       { isolateKey: true }. Those builders key on postsRankedPage /
//       accountPostsPage, which the deck columns also read and then render
//       entry.body from. A slim page cached under that shared key is handed
//       straight to a deck inside the staleTime and the post viewer renders
//       empty. See PR #1545 and issue #1556.
//
//   ii. withSlimEntries() around an INFINITE builder must NOT pass it. The
//       feed's infinite key is hand-built in feed-layout.tsx for the poll's
//       setQueryData merge; marking it there would silently write the merge to
//       a key nothing renders, and the "new posts" chip would stop updating
//       stats without any error.
//
// Both real call sites pass the options through a local variable, so the wrapped
// builder is resolved through simple `const x = builder(...)` declarations
// rather than only matching a call written inline. Anything this cannot classify
// is reported rather than skipped: a guard that silently ignores what it does
// not understand is not a guard.
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
 * The builder behind an argument, following one level of `const x = builder(...)`
 * within the enclosing function. Returns null when it cannot be determined,
 * which the caller reports rather than ignores.
 */
function resolveBuilder(arg) {
  const direct = calleeName(arg);
  if (direct) return direct;
  if (!arg || !ts.isIdentifier(arg)) return null;

  for (let scope = arg.parent; scope; scope = scope.parent) {
    let found = null;
    ts.forEachChild(scope, function walk(node) {
      if (found) return;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === arg.text &&
        node.initializer
      ) {
        found = calleeName(node.initializer);
        return;
      }
      ts.forEachChild(node, walk);
    });
    if (found) return found;
    if (ts.isFunctionDeclaration(scope) || ts.isSourceFile(scope)) break;
  }
  return null;
}

/** true / false / "unknown" when the options argument cannot be read literally. */
function isolateKeyOf(arg) {
  if (arg === undefined) return false;
  if (!ts.isObjectLiteralExpression(arg)) return "unknown";
  for (const p of arg.properties) {
    if (ts.isSpreadAssignment(p)) return "unknown";
    const named =
      ts.isPropertyAssignment(p) &&
      ((ts.isIdentifier(p.name) && p.name.text === "isolateKey") ||
        (ts.isStringLiteral(p.name) && p.name.text === "isolateKey"));
    if (!named) continue;
    if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
    return "unknown";
  }
  return false;
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

  (function visit(node) {
    if (calleeName(node) === "withSlimEntries") {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart());
      const where = `${fileName}:${line + 1}`;
      const wrapped = resolveBuilder(node.arguments[0]);
      const isolated = isolateKeyOf(node.arguments[1]);

      if (!wrapped) {
        findings.push(
          `${where}  cannot tell which builder is wrapped — pass the builder call ` +
            `directly, or assign it to a const in the same function, so this rule can see it`
        );
      } else if (SINGLE_PAGE_BUILDERS.has(wrapped)) {
        if (isolated === false) {
          findings.push(
            `${where}  withSlimEntries(${wrapped}) needs { isolateKey: true } — ` +
              `deck columns read that page key and render entry.body from it`
          );
        } else if (isolated === "unknown") {
          findings.push(
            `${where}  withSlimEntries(${wrapped}) passes options this rule cannot read — ` +
              `write { isolateKey: true } literally`
          );
        }
      } else if (INFINITE_BUILDERS.has(wrapped) && isolated !== false) {
        findings.push(
          `${where}  withSlimEntries(${wrapped}) must NOT set isolateKey — ` +
            `the feed poll hand-builds this key for its setQueryData merge`
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
