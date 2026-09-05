import fs from "fs";
import path from "path";

/**
 * A server component may not reach a "use client" module through the
 * `@/features/shared` barrel.
 *
 * The barrel re-exports its modules with `export *`. When one of those modules
 * is a client boundary, that star re-export hands server components `undefined`
 * instead of the component: React reports "Element type is invalid ... but got:
 * undefined" while server-rendering, and "Received a promise that resolves to:
 * undefined" in the browser. The subtree renders as nothing at all, at HTTP 200,
 * so it fails silently. That is how every profile page shipped with no posts
 * when `entry-list-content` gained its "use client" directive.
 *
 * Nothing else in the suite can see this: vitest renders components in jsdom and
 * never crosses the server/client boundary, so the barrel resolves normally
 * there, and `next build` compiles it happily. It only breaks when a real server
 * renders the route. So the check is on the import graph rather than on output.
 *
 * Deliberately conservative: a module imported ANYWHERE by a client component is
 * treated as client-side and skipped, because it cannot be told apart from a
 * genuine server component by source alone. That trades some coverage for never
 * failing a PR that is actually fine.
 */

const SRC = path.resolve(__dirname, "../..");
const BARREL = path.join(SRC, "features/shared/index.ts");
const BARREL_SPECIFIER = "@/features/shared";

/**
 * Feature barrels that server pages must never import from. Each is checked for
 * the cycle shape above; the curation desk barrel is additionally required to
 * be light (views and types only) and never imported from inside its own
 * feature, so the cycle cannot form in the first place.
 */
const FEATURE_BARRELS = [
  { barrel: BARREL, specifier: BARREL_SPECIFIER },
  { barrel: path.join(SRC, "features/curation-desk/index.ts"), specifier: "@/features/curation-desk" }
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "specs") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function isClientBoundary(file: string): boolean {
  // The directive has to be the first statement, so walk past leading blanks
  // and comments and look at what comes first. Deliberately a scan rather than
  // a regex: matching optional repeated comments before the directive needs
  // nested quantifiers, which backtrack exponentially on input like `/*` then
  // many `*//*` (CodeQL js/redos), and this runs over every file under src.
  let inBlockComment = false;

  for (const rawLine of read(file).split("\n")) {
    let line = rawLine.trim();

    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2).trim();
      inBlockComment = false;
    }

    while (line.startsWith("/*")) {
      const end = line.indexOf("*/", 2);
      if (end === -1) {
        inBlockComment = true;
        line = "";
        break;
      }
      line = line.slice(end + 2).trim();
    }

    if (!line || line.startsWith("//")) continue;

    return line.startsWith('"use client"') || line.startsWith("'use client'");
  }

  return false;
}

/** Resolve an import specifier to a file inside src, or null if it leaves src. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx")
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Every edge, lazy ones included. `dynamic(() => import("..."))` is how much of
// this codebase reaches its client components, and missing those would report
// client modules as server ones.
const ANY_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

// Only the edges that run while the module is being evaluated. A lazy
// `import()` resolves long after, so it cannot take part in an initialisation
// cycle, and counting it as one would condemn imports that are perfectly safe.
const STATIC_IMPORT = /(?:\bfrom\s*|\bimport\s+)["']([^"']+)["']/g;

function importedSpecifiers(file: string, pattern: RegExp = ANY_IMPORT): string[] {
  return [...read(file).matchAll(pattern)].map((m) => m[1]);
}

/** Every name a module exports, following its own `export *` re-exports. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);

  const source = read(file);

  for (const m of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class|enum|interface|type)\s+([A-Za-z0-9_$]+)/g
  )) {
    names.add(m[1]);
  }

  for (const m of source.matchAll(/export\s*\{([^}]*)\}(?!\s*from\s*["']\.)/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.split(/\s+as\s+/).pop()?.trim();
      if (alias) names.add(alias);
    }
  }

  for (const m of source.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    const target = resolveSpecifier(file, m[1]);
    if (target) for (const name of exportedNames(target, seen)) names.add(name);
  }

  return names;
}

describe("server components and the shared barrel", () => {
  const files = walk(SRC);

  // Anything a client component pulls in is client-side too, however deep.
  const clientTainted = new Set<string>();
  const queue = files.filter(isClientBoundary);
  queue.forEach((f) => clientTainted.add(f));

  while (queue.length) {
    const current = queue.shift()!;
    for (const specifier of importedSpecifiers(current)) {
      const target = resolveSpecifier(current, specifier);
      if (target && !clientTainted.has(target)) {
        clientTainted.add(target);
        queue.push(target);
      }
    }
  }

  /**
   * Does this module import the barrel back, closing a cycle with it?
   *
   * Counts a direct static import by the module itself, plus one in anything it
   * re-exports with `export *`, since those form a single export surface with
   * it. Lazy `import()` does not count: it resolves long after evaluation, so it
   * cannot take part in an initialisation cycle.
   *
   * NOT transitive through ordinary imports, and that is a measured choice
   * rather than an oversight. Following every static edge marks `time-label`,
   * `tag`, `entry-stats` and `bookmark-btn` as cyclic, because somewhere down
   * their helpers something reaches the barrel. The entry page imports all four
   * from the barrel and server-renders them correctly today: 12 `<time>`
   * elements, its stats, its tag links, its bookmark button, no error. A guard
   * that fails CI on pages that demonstrably work gets bypassed, so this keeps
   * to the shape that actually broke and stays quiet otherwise. A deeper cycle
   * would slip through; the reproduction in the PR body is how that one gets
   * caught.
   */
  function closesCycleWithBarrel(file: string, specifier = BARREL_SPECIFIER, seen = new Set<string>()): boolean {
    if (seen.has(file)) return false;
    seen.add(file);

    if (importedSpecifiers(file, STATIC_IMPORT).includes(specifier)) return true;

    for (const m of read(file).matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveSpecifier(file, m[1]);
      if (target && closesCycleWithBarrel(target, specifier, seen)) return true;
    }

    return false;
  }

  // The dangerous barrel entries, and the names they contribute.
  //
  // Two conditions have to meet. The module must be a client boundary, and it
  // must import the barrel back, so the barrel and the module form a cycle
  // across that boundary. Entering the cycle at the barrel then reads the
  // module's exports before they exist. Entering at the module instead lets the
  // barrel finish first, which is why the feed list, importing the very same
  // component by its own path, kept working throughout.
  //
  // Client boundaries with no cycle are fine: `/discover` server-renders 146
  // UserAvatars through this barrel. The cycle is what breaks it, not the
  // directive on its own.
  function clientExportsOf(barrel: string, specifier: string): Map<string, string> {
    const exports = new Map<string, string>();
    for (const m of read(barrel).matchAll(/export\s*(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveSpecifier(barrel, m[1]);
      if (!target || !isClientBoundary(target) || !closesCycleWithBarrel(target, specifier)) continue;
      for (const name of exportedNames(target)) {
        exports.set(name, path.relative(SRC, target));
      }
    }
    return exports;
  }

  const clientExports = clientExportsOf(BARREL, BARREL_SPECIFIER);

  it("knows which barrel exports are client boundaries", () => {
    // Guard the guard: if this ever empties out, every assertion below passes
    // for the wrong reason.
    expect(clientExports.size).toBeGreaterThan(0);
  });

  it.each(FEATURE_BARRELS)("never imports a client-boundary component through $specifier", ({ barrel, specifier }) => {
    const exportsForBarrel = barrel === BARREL ? clientExports : clientExportsOf(barrel, specifier);
    const violations: string[] = [];

    for (const file of files) {
      if (clientTainted.has(file)) continue;

      const source = read(file);
      for (const m of source.matchAll(
        new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${specifier}["']`, "g")
      )) {
        for (const part of m[1].split(",")) {
          const name = part.split(/\s+as\s+/)[0].trim();
          const owner = exportsForBarrel.get(name);
          if (!owner) continue;

          violations.push(
            `${path.relative(SRC, file)} imports "${name}" from "${specifier}". ` +
              `That name comes from ${owner}, which is a "use client" module AND imports ` +
              `the barrel back, so the two form a cycle across the client boundary. ` +
              `Reaching it through the barrel resolves to undefined at server render ` +
              `time and the subtree silently renders as nothing. Import it from its own ` +
              `module instead: "${specifier}/..." .`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  describe("the curation desk barrel", () => {
    const featureDir = path.join(SRC, "features/curation-desk");
    const specifier = "@/features/curation-desk";

    it("is never imported by a server route: pages reach the views by path", () => {
      const routeFiles = walk(path.join(SRC, "app/curation"));
      const offenders = routeFiles.filter((file) =>
        importedSpecifiers(file).some((s) => s === specifier)
      );
      expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
    });

    it("is never imported from inside its own feature", () => {
      const offenders = walk(featureDir).filter(
        (file) => importedSpecifiers(file).includes(specifier) || importedSpecifiers(file).includes(".")
      );
      expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
    });

    it("stays light: the four views and the types only", () => {
      const source = read(path.join(featureDir, "index.ts"));
      const targets = [...source.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1]).sort();
      expect(targets).toEqual([
        "curation-guide",
        "curation-my-marks-view",
        "curation-queue-view",
        "curation-recommendations-view",
        "types"
      ]);
    });
  });
});
