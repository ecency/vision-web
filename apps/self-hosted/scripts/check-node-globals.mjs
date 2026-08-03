#!/usr/bin/env node
/**
 * Fail the build when an emitted chunk dereferences a Node global unguarded.
 *
 * This app is bundled by Rsbuild, which provides no `process`, `Buffer` or
 * `__dirname`. Next.js does provide them, so a dependency that reads one is
 * green on ecency.com and fatal here: the chunk throws at load, before any app
 * code runs, and every hosted blog renders blank with nothing in the server
 * logs to explain it.
 *
 * That has now shipped twice. `Buffer.from()` in render-helper was the first.
 * The second was the npm `assert` polyfill, pulled in by `hive-auth-wrapper`,
 * which reads `process.emitWarning` and `process.stderr` at module scope.
 *
 * Feature detection is the normal, correct pattern and must not fail the build.
 * Crucially the detection is often on a SIBLING capability rather than on the
 * global itself, so requiring `typeof <the global>` produces false positives on
 * code that is perfectly safe:
 *
 *   typeof process !== 'undefined' && process.versions        <- allowed
 *   typeof btoa > 'u' && (g.btoa = () => Buffer.from(...))    <- allowed, sibling guard
 *   typeof TextEncoder > 'u' ? enc() : Buffer.from(...)       <- allowed, sibling guard
 *   process.emitWarning ? process.emitWarning : console.warn  <- REJECTED, no detection
 *   process.stderr && process.stderr.isTTY                    <- REJECTED, no detection
 *
 * So the rule is: a dereference with no `typeof` feature test anywhere nearby.
 * That accepts every fallback shape above and still catches a module-scope read,
 * which is the one that actually throws at chunk load.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist', 'static', 'js');
const GLOBALS = ['process', 'Buffer', '__dirname', '__filename'];

/** How far back to look for a typeof guard protecting a dereference. */
const GUARD_WINDOW = 220;

function findUnguarded(source, globalName) {
  const hits = [];
  const deref = new RegExp(`(?<![\\w$.])${globalName}\\s*[.[]`, 'g');
  // Any typeof feature test nearby, on this global or a sibling capability.
  // Minifiers rewrite comparisons into forms like "u">typeof process, so the
  // operand order is not something to rely on.
  const guard = /typeof\s+[\w$]+/;

  for (const match of source.matchAll(deref)) {
    const from = Math.max(0, match.index - GUARD_WINDOW);
    if (!guard.test(source.slice(from, match.index))) {
      hits.push({ index: match.index, excerpt: source.slice(from, match.index + 60) });
    }
  }
  return hits;
}

let failures = 0;

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

for (const name of files) {
  const source = readFileSync(join(DIST, name), 'utf8');
  for (const globalName of GLOBALS) {
    for (const hit of findUnguarded(source, globalName)) {
      failures += 1;
      console.error(
        `[node-globals] ${name}: unguarded ${globalName} at ${hit.index}\n  ...${hit.excerpt.replace(/\n/g, ' ')}`
      );
    }
  }
}

if (failures > 0) {
  console.error(
    `\n[node-globals] ${failures} unguarded reference(s). This throws at chunk load in the browser and blanks every instance.\n` +
      'Alias the offending module to a browser-safe shim (see src/shims/assert.ts) rather than defining the global.'
  );
  process.exit(1);
}

console.log(`[node-globals] ${files.length} chunk(s) clean`);
