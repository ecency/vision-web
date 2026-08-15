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
  // The directive has to be the first statement, so a match in the opening
  // lines is the directive rather than a mention in prose.
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(read(file));
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

// Static `from "x"`, bare `import "x"`, and lazy `import("x")` / `require("x")`
// alike. The lazy forms matter most: `dynamic(() => import("..."))` is how much
// of this codebase reaches its client components, and missing those edges would
// report client modules as server ones.
const IMPORT_SOURCE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

function importedSpecifiers(file: string): string[] {
  return [...read(file).matchAll(IMPORT_SOURCE)].map((m) => m[1]);
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

  /** Does this module, or anything it re-exports, import the barrel back? */
  function closesCycleWithBarrel(file: string, seen = new Set<string>()): boolean {
    if (seen.has(file)) return false;
    seen.add(file);

    const source = read(file);
    if (new RegExp(`from\\s*["']${BARREL_SPECIFIER}["']`).test(source)) return true;

    for (const m of source.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveSpecifier(file, m[1]);
      if (target && closesCycleWithBarrel(target, seen)) return true;
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
  const clientExports = new Map<string, string>();
  for (const m of read(BARREL).matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    const target = resolveSpecifier(BARREL, m[1]);
    if (!target || !isClientBoundary(target) || !closesCycleWithBarrel(target)) continue;
    for (const name of exportedNames(target)) {
      clientExports.set(name, path.relative(SRC, target));
    }
  }

  it("knows which barrel exports are client boundaries", () => {
    // Guard the guard: if this ever empties out, every assertion below passes
    // for the wrong reason.
    expect(clientExports.size).toBeGreaterThan(0);
  });

  it("never imports a client-boundary component through the barrel", () => {
    const violations: string[] = [];

    for (const file of files) {
      if (clientTainted.has(file)) continue;

      const source = read(file);
      for (const m of source.matchAll(
        new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${BARREL_SPECIFIER}["']`, "g")
      )) {
        for (const part of m[1].split(",")) {
          const name = part.split(/\s+as\s+/)[0].trim();
          const owner = clientExports.get(name);
          if (!owner) continue;

          violations.push(
            `${path.relative(SRC, file)} imports "${name}" from "${BARREL_SPECIFIER}". ` +
              `That name comes from ${owner}, which is a "use client" module AND imports ` +
              `the barrel back, so the two form a cycle across the client boundary. ` +
              `Reaching it through the barrel resolves to undefined at server render ` +
              `time and the subtree silently renders as nothing. Import it from its own ` +
              `module instead: "${BARREL_SPECIFIER}/..." .`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
