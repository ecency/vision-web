import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The build output has to load in plain Node, not only inside a bundler.
 *
 * vision-web#1519: the emitted .mjs carried `import "remarkable/linkify"`, a
 * legacy module directory (a folder holding only a package.json stub). Every
 * bundler resolves it, Node's ESM resolver refuses it, so
 * `import "@ecency/render-helper"` failed with ERR_UNSUPPORTED_DIR_IMPORT for
 * any consumer without a bundler, while every check in this repo stayed green.
 * The newsletter service found it in production.
 *
 * Two decisions worth knowing:
 *
 * It runs the real `node` binary. Importing the files from inside vitest would
 * prove nothing, because Vite would resolve them, and that resolution is
 * exactly the layer that hid the bug.
 *
 * It builds its own output rather than reading `dist/`. `dist` is committed and
 * the auto-changeset bot rebuilds it when the version label lands, so on a
 * branch that changes the build config the committed copy is legitimately
 * stale. Asserting against it would go red on a fresh checkout, and red on
 * `web-build.yml`, which runs `pnpm -r test` with no preceding
 * `pnpm build:packages`.
 */

const exec = promisify(execFile);
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Generous, because a cold CI worker builds the package from scratch here. */
const BUILD_MS = 300_000;
/**
 * The child's budget, and the case's, deliberately different. If they were
 * equal, a loaded worker would reach vitest's deadline at the same moment
 * execFile tried to kill the child, and the failure would be a bare outer
 * timeout instead of the subprocess error that says what actually went wrong.
 * The child has to lose first.
 */
const CHILD_MS = 30_000;
const CASE_MS = CHILD_MS * 3;

let out: string;
/** Metafile paths, relative to `out`, as they were before the notices generator consumed them. */
let metafiles: string[] = [];

/** Every metafile tsup emitted, at any depth, relative to `out`. */
function metafilesUnder(dir: string, prefix = ""): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? metafilesUnder(join(dir, entry.name), `${prefix}${entry.name}/`)
            : /^metafile-.*\.json$/.test(entry.name)
              ? [`${prefix}${entry.name}`]
              : []
    );
}

beforeAll(async () => {
    // Under the package's own node_modules: never tracked by git, and Node
    // resolves bare specifiers by walking up from the importing file, so the
    // emitted `import "@xmldom/xmldom"` only finds its target from inside the
    // package tree. Building to the OS temp dir fails with ERR_MODULE_NOT_FOUND
    // on the first external.
    out = mkdtempSync(join(PKG, "node_modules", ".render-helper-build-"));
    // Through the environment, not --out-dir: that flag applies to every config
    // at once and would put both builds, and both of their metafile-esm.json,
    // in one directory (#1863). Same variable shape as the sdk's SDK_DIST_ROOT.
    await exec(join(PKG, "node_modules/.bin/tsup"), ["--metafile"], {
        cwd: PKG,
        timeout: BUILD_MS,
        env: { ...process.env, RENDER_HELPER_DIST_ROOT: out }
    });
    metafiles = metafilesUnder(out).sort();
    // No path argument, exactly as `pnpm build` calls it: the generator has to
    // follow the same root the build used, or a build with the override set
    // would look for metafiles in a `dist` that was never written.
    await exec(process.execPath, [join(PKG, "scripts/third-party-notices.mjs")], {
        cwd: PKG,
        timeout: CHILD_MS,
        env: { ...process.env, RENDER_HELPER_DIST_ROOT: out }
    });
}, BUILD_MS);

afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
});

interface Loaded {
    exports: number;
    linked: boolean;
}

/**
 * Loads one built entry in a separate, real Node process and reports what it
 * found. The path travels in the environment rather than being interpolated
 * into the snippet, so no code is built from a value.
 */
async function load(file: string, how: "esm" | "cjs"): Promise<Loaded> {
    const read = `
        const html = m.renderPostBody({ author: "a", permlink: "p", body: process.env.RH_BODY }, false);
        console.log(JSON.stringify({ exports: Object.keys(m).length, linked: html.includes('<a href="https://ecency.com"') }));`;
    const args =
        how === "esm"
            ? ["--input-type=module", "-e", `import(process.env.RH_ENTRY).then((m) => {${read}})`]
            : ["-e", `const m = require(process.env.RH_ENTRY);${read}`];
    const { stdout } = await exec(process.execPath, args, {
        cwd: PKG,
        timeout: CHILD_MS,
        env: { ...process.env, RH_ENTRY: file, RH_BODY: "# Title\n\nhttps://ecency.com and **bold**" }
    });
    return JSON.parse(stdout.trim()) as Loaded;
}

describe("the build output loads in plain Node", () => {
    it(
        "loads as ESM and renders",
        async () => {
            const result = await load(join(out, "node", "index.mjs"), "esm");
            expect(result.exports).toBeGreaterThan(0);
            // Not merely "it imported": linkify is the dependency that broke, so
            // an autolinked URL is what proves it is actually wired up.
            expect(result.linked).toBe(true);
        },
        CASE_MS
    );

    it(
        "loads as CommonJS and renders",
        async () => {
            const result = await load(join(out, "node", "index.cjs"), "cjs");
            expect(result.exports).toBeGreaterThan(0);
            expect(result.linked).toBe(true);
        },
        CASE_MS
    );

    it("keeps remarkable inlined in the node builds", () => {
        // The packaging decision behind the fix, stated directly, so a failure
        // says WHY rather than only that a module would not load.
        //
        // Anchored to the start of a line, and it has to be: esbuild hoists real
        // imports there, while the INLINED remarkable contains a deprecation
        // message whose text is literally "import linkify from
        // 'remarkable/linkify'". An unanchored search matches that string and
        // fails on a correct build. Every emission form esbuild can produce is
        // covered, including the bare side-effect import, which is the exact
        // shape #1519 described.
        const specifiersOf = (source: string) =>
            [
                ...source.matchAll(
                    /^(?:import\s*|import[^\n]*?\bfrom\s*|export[^\n]*?\bfrom\s*|(?:var|const|let)[^\n]*?=\s*require\()\s*["']([^"']+)["']/gm
                )
            ].map((m) => m[1]);

        for (const file of ["index.mjs", "index.cjs"]) {
            const specifiers = specifiersOf(readFileSync(join(out, "node", file), "utf8"));
            expect(specifiers.length).toBeGreaterThan(0);
            expect(specifiers.filter((s) => s === "remarkable" || s.startsWith("remarkable/"))).toEqual([]);
        }
    });

    it("ships the licences of everything it inlines", () => {
        // Bundling remarkable brings autolinker and tslib with it. MIT requires
        // the copyright and permission notice to travel with the code, so the
        // build generates notices from the bundler's metafile and they must
        // reach the published output.
        const notices = readFileSync(join(out, "THIRD-PARTY-NOTICES.md"), "utf8");
        for (const name of ["remarkable", "autolinker", "tslib"]) {
            expect(notices).toContain(`## ${name} `);
        }
        expect(notices).toContain("Permission is hereby granted, free of charge");
        expect(notices).toMatch(/Copyright \(c\)/);
    });

    it("still points the node conditions at the files this test builds", () => {
        // The test builds elsewhere, so this pins the link back: if the exports
        // map stopped naming these files, the checks above would be proving
        // something about output nobody loads.
        const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
            exports?: Record<string, Record<string, string>>;
            files?: string[];
        };
        expect(pkg.exports?.["."]?.import).toBe("./dist/node/index.mjs");
        expect(pkg.exports?.["."]?.require).toBe("./dist/node/index.cjs");
        // React Native and browsers take the other build, which this change
        // deliberately leaves alone.
        expect(pkg.exports?.["."]?.["react-native"]).toBe("./dist/browser/index.js");
        expect(pkg.exports?.["."]?.browser).toBe("./dist/browser/index.js");
        // And dist is what npm packs, which is how the notices above ship.
        expect(pkg.files).toContain("dist");
    });

    it("gives each build its own metafile", () => {
        // Both builds emit esm and tsup names the metafile after the format, so
        // a shared output directory means both builds writing metafile-esm.json
        // to one path: one copy is simply lost, and when the writes overlap the
        // notices generator dies parsing one document followed by the tail of
        // the other, which took a staging deploy with it (#1863).
        expect(metafiles).toEqual([
            "browser/metafile-esm.json",
            "node/metafile-cjs.json",
            "node/metafile-esm.json"
        ]);
    });

    it.each([
        ["--out-dir", "space separated"],
        ["--out-dir=", "with an equals sign"],
        ["--outDir", "camel case, which cac also accepts"],
        ["--outDir=", "camel case with an equals sign"],
        ["-d", "the short alias"],
        ["-d=", "the short alias with an equals sign"]
    ])(
        "refuses %s (%s) rather than letting the two builds share one directory",
        async (flag) => {
            // Aimed at a path nothing else reads: if the guard ever regresses,
            // this must not write into the fixture the other cases assert on.
            // Cleared first and after, because a regression leaves a real build
            // there and the next run would otherwise fail on the leftover
            // rather than on the guard.
            const target = join(PKG, "node_modules", ".render-helper-refused");
            rmSync(target, { recursive: true, force: true });
            const args = flag.endsWith("=") ? [`${flag}${target}`, "--metafile"] : [flag, target, "--metafile"];

            const attempt = exec(join(PKG, "node_modules/.bin/tsup"), args, { cwd: PKG, timeout: CHILD_MS });

            await expect(attempt).rejects.toThrow(/RENDER_HELPER_DIST_ROOT/);
            const built = existsSync(target);
            rmSync(target, { recursive: true, force: true });
            expect(built).toBe(false);
        },
        CASE_MS
    );

    it("writes both builds where package.json says they are", async () => {
        // The default branch is what ships, and no other case exercises it: the
        // spec always overrides the root, and tsconfig excludes this file.
        const previous = process.env.RENDER_HELPER_DIST_ROOT;
        delete process.env.RENDER_HELPER_DIST_ROOT;
        try {
            const configs = (await import("../tsup.config")).default as { outDir: string }[];

            expect(configs.map((config) => config.outDir)).toEqual(["dist/browser", "dist/node"]);
        } finally {
            if (previous === undefined) delete process.env.RENDER_HELPER_DIST_ROOT;
            else process.env.RENDER_HELPER_DIST_ROOT = previous;
        }
    });

    it(
        "cleans only the two directories the builds own",
        async () => {
            // The clean step used to delete the root itself, so a root that
            // named anything shared (a stale absolute path, `.`, a workspace
            // directory) took unrelated files with it before tsup ran.
            const root = mkdtempSync(join(PKG, "node_modules", ".render-helper-clean-"));
            const bystander = join(root, "not-ours.txt");
            writeFileSync(bystander, "keep me");

            await exec("npm", ["run", "build"], {
                cwd: PKG,
                timeout: BUILD_MS,
                env: { ...process.env, RENDER_HELPER_DIST_ROOT: root }
            });

            const survived = existsSync(bystander);
            const built = existsSync(join(root, "node", "index.mjs"));
            rmSync(root, { recursive: true, force: true });

            expect(survived).toBe(true);
            expect(built).toBe(true);
        },
        BUILD_MS
    );

    it("leaves no bundler metafile in the output", () => {
        // --metafile is only there to tell the notices generator what was
        // inlined. It is consumed and deleted, so it never reaches the tarball.
        expect(metafilesUnder(out)).toEqual([]);
    });

    it("emits the browser build too", () => {
        // Also what stops the case above passing on an empty directory.
        expect(existsSync(join(out, "browser", "index.js"))).toBe(true);
        expect(existsSync(join(out, "browser", "index.d.ts"))).toBe(true);
    });
});
