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
// CI runs with --fail: any finding exits 1.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

const ROOT = new URL("..", import.meta.url).pathname;
const SINGLE_PAGE_BUILDERS = new Set([
  "getPostsRankedQueryOptions",
  "getAccountPostsQueryOptions"
]);
const INFINITE_BUILDERS = new Set([
  "getPostsRankedInfiniteQueryOptions",
  "getAccountPostsInfiniteQueryOptions"
]);
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

/** The identifier being called, for both `f()` and `ns.f()`. */
function calleeName(node) {
  if (!ts.isCallExpression(node)) return null;
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) return e.name.text;
  return null;
}

/** True when an options argument literally sets isolateKey: true. */
function hasIsolateKey(arg) {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ((ts.isIdentifier(p.name) && p.name.text === "isolateKey") ||
        (ts.isStringLiteral(p.name) && p.name.text === "isolateKey")) &&
      p.initializer.kind === ts.SyntaxKind.TrueKeyword
  );
}

const findings = [];
for (const file of files) {
  const src = ts.createSourceFile(
    file,
    readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  (function visit(node) {
    if (calleeName(node) === "withSlimEntries") {
      const wrapped = calleeName(node.arguments[0]);
      const isolated = hasIsolateKey(node.arguments[1]);
      const { line } = src.getLineAndCharacterOfPosition(node.getStart());
      const where = `${relative(ROOT, file)}:${line + 1}`;

      if (wrapped && SINGLE_PAGE_BUILDERS.has(wrapped) && !isolated) {
        findings.push(
          `${where}  withSlimEntries(${wrapped}) needs { isolateKey: true } — ` +
            `deck columns read that page key and render entry.body from it`
        );
      }
      if (wrapped && INFINITE_BUILDERS.has(wrapped) && isolated) {
        findings.push(
          `${where}  withSlimEntries(${wrapped}) must NOT set isolateKey — ` +
            `the feed poll hand-builds this key for its setQueryData merge`
        );
      }
    }
    ts.forEachChild(node, visit);
  })(src);
}

if (findings.length === 0) {
  console.log(`slim-entries audit: ${files.length} files, no findings`);
  process.exit(0);
}
console.log(`slim-entries audit: ${findings.length} finding(s)`);
for (const f of findings) console.log(`  ${f}`);
process.exit(failing ? 1 : 0);
