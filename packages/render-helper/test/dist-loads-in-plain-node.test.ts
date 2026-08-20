import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
 * It builds into a scratch directory rather than reading `dist/`. `dist` is
 * committed, and the auto-changeset bot is what rebuilds it when the version
 * label lands, so on a branch that changes the build config the committed dist
 * is legitimately stale. Asserting against it would make this suite red on a
 * fresh checkout, and red on `web-build.yml`, which runs `pnpm -r test` with no
 * preceding `pnpm build:packages`. Building here keeps the test about what the
 * config produces, which is the thing under test.
 */

const exec = promisify(execFile);
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let out: string;

beforeAll(async () => {
    // Under the package's own node_modules, for two reasons: it is never
    // tracked by git, and Node resolves bare specifiers by walking up from the
    // importing file, so the emitted `import "@xmldom/xmldom"` only finds its
    // target from inside the package tree. Building to /tmp fails with
    // ERR_MODULE_NOT_FOUND on the first external.
    out = mkdtempSync(join(PKG, "node_modules", ".render-helper-build-"));
    await exec(join(PKG, "node_modules/.bin/tsup"), ["--out-dir", out], { cwd: PKG, timeout: 300_000 });
}, 300_000);

afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
});

/** Runs a snippet in a separate, real Node process and returns its stdout. */
async function inNode(args: string[]): Promise<string> {
    const { stdout } = await exec(process.execPath, args, { cwd: PKG, timeout: 60_000 });
    return stdout.trim();
}

const BODY = "# Title\n\nhttps://ecency.com and **bold**";
const report = (m: string) =>
    `const html = ${m}.renderPostBody({ author: "a", permlink: "p", body: ${JSON.stringify(BODY)} }, false);
     console.log(JSON.stringify({ exports: Object.keys(${m}).length, linked: html.includes("<a href=\\"https://ecency.com\\"") }));`;

describe("the build output loads in plain Node", () => {
    it("loads as ESM and renders", async () => {
        const result = JSON.parse(
            await inNode(["--input-type=module", "-e", `import(${JSON.stringify(join(out, "index.mjs"))}).then((m) => { ${report("m")} })`])
        );
        expect(result.exports).toBeGreaterThan(0);
        // Not merely "it imported": linkify is the dependency that broke, so an
        // autolinked URL is what proves it is actually wired up.
        expect(result.linked).toBe(true);
    });

    it("loads as CommonJS and renders", async () => {
        const result = JSON.parse(await inNode(["-e", `const m = require(${JSON.stringify(join(out, "index.cjs"))}); ${report("m")}`]));
        expect(result.exports).toBeGreaterThan(0);
        expect(result.linked).toBe(true);
    });

    it("keeps remarkable inlined in the node builds", async () => {
        // The packaging decision behind the fix, stated directly, so a failure
        // says WHY rather than only that a module would not load.
        //
        // Anchored to the start of a line, and it has to be: esbuild hoists real
        // imports there, while the INLINED remarkable contains a deprecation
        // message whose text is literally "import linkify from
        // 'remarkable/linkify'". An unanchored search matches that string and
        // fails on a correct build.
        //
        // Every emission form esbuild can produce is covered, including the bare
        // side-effect import, which is the exact shape #1519 described.
        const specifiersOf = (source: string) =>
            [
                ...source.matchAll(
                    /^(?:import\s*|import[^\n]*?\bfrom\s*|export[^\n]*?\bfrom\s*|(?:var|const|let)[^\n]*?=\s*require\()\s*["']([^"']+)["']/gm
                )
            ].map((m) => m[1]);

        for (const file of ["index.mjs", "index.cjs"]) {
            const specifiers = specifiersOf(readFileSync(join(out, file), "utf8"));
            expect(specifiers.length).toBeGreaterThan(0);
            expect(specifiers.filter((s) => s === "remarkable" || s.startsWith("remarkable/"))).toEqual([]);
        }
    });

    it("still points the node conditions at the files this test builds", () => {
        // The test builds elsewhere, so this pins the link back: if the exports
        // map stopped naming these files, the checks above would be proving
        // something about output nobody loads.
        const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
        expect(pkg.exports?.["."]?.import).toBe("./dist/node/index.mjs");
        expect(pkg.exports?.["."]?.require).toBe("./dist/node/index.cjs");
        // React Native and browsers take the other build, which this change
        // deliberately leaves alone.
        expect(pkg.exports?.["."]?.["react-native"]).toBe("./dist/browser/index.js");
        expect(pkg.exports?.["."]?.browser).toBe("./dist/browser/index.js");
    });
});
