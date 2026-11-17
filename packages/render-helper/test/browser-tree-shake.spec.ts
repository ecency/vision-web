import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourceEntries } from "../tsup.config";

/**
 * The browser build has to let a consumer's bundler drop what it does not use
 * (vision-web#1804).
 *
 * It was one pre-bundled file. To a bundler that is one module, so a page that
 * only proxifies an image URL still pulled in the whole markdown and sanitize
 * stack: remarkable, xss, htmlparser2, @xmldom/xmldom. On a community feed that
 * was the largest single script transfer. The browser build now emits a module
 * per source file, as `@ecency/sdk` does since #1834.
 *
 * This bundles small consumers against a fresh build with esbuild and reads the
 * metafile, which is what decides the question: which inputs a bundle that
 * imports a few exports actually contains. It builds its own output for the
 * same reason as dist-loads-in-plain-node.spec.ts: the committed dist is stale
 * on any branch that changes the build.
 */

const exec = promisify(execFile);
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_MS = 300_000;

// esbuild is tsup's dependency, not ours; resolve it through tsup.
const esbuild = createRequire(createRequire(join(PKG, "package.json")).resolve("tsup"))(
    "esbuild"
) as typeof import("esbuild");

let out: string;

beforeAll(async () => {
    // Inside the package tree so the build's bare imports (remarkable, xss...)
    // resolve from the package's node_modules when the consumer is bundled.
    out = mkdtempSync(join(PKG, "node_modules", ".render-helper-shake-"));
    await exec(join(PKG, "node_modules/.bin/tsup"), [], {
        cwd: PKG,
        timeout: BUILD_MS,
        env: { ...process.env, RENDER_HELPER_DIST_ROOT: out }
    });
    // A consumer's bundler drops an unused module only when the package says it
    // is side-effect free. The published dist sits under package.json, which
    // says so; this throwaway root needs the same declaration, copied from it.
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
        name?: string;
        type?: string;
        sideEffects?: unknown;
    };
    writeFileSync(
        join(out, "package.json"),
        JSON.stringify({ name: pkg.name, type: pkg.type, sideEffects: pkg.sideEffects })
    );
}, BUILD_MS);

afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
});

/**
 * The input paths whose code a browser bundle of `source` ends up containing.
 * Read from the output, not `metafile.inputs`: that lists every file esbuild
 * parsed, including the ones it then dropped.
 */
async function inputsOf(source: string): Promise<string[]> {
    const result = await esbuild.build({
        stdin: { contents: source, resolveDir: PKG, loader: "js" },
        bundle: true,
        write: false,
        metafile: true,
        format: "esm",
        platform: "browser",
        logLevel: "silent"
    });
    const [output] = Object.values(result.metafile!.outputs);
    return Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([path]) => path);
}

const HEAVY = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(remarkable|xss|htmlparser2|@xmldom\/xmldom|dom-serializer|lolight)\//;

describe("the browser build is tree-shakeable", () => {
    it("leaves the markdown and sanitize stack out of a bundle that only proxifies images", async () => {
        const inputs = await inputsOf(
            `import { proxifyImageSrc, buildSrcSet, setProxyBase } from ${JSON.stringify(join(out, "browser", "index.js"))};
             setProxyBase("https://images.ecency.com");
             console.log(proxifyImageSrc("https://x.test/a.png", 600, 400), buildSrcSet("https://x.test/a.png"));`
        );
        expect(inputs.filter((p) => HEAVY.test(p))).toEqual([]);
    }, 60_000);

    it("keeps sideEffects: false, which the split depends on", () => {
        const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { sideEffects?: unknown };
        expect(pkg.sideEffects).toBe(false);
    });

    it("still bundles the stack for a consumer that renders markdown", async () => {
        // The control: proves the check above can see the stack when it is there.
        const inputs = await inputsOf(
            `import { renderPostBody } from ${JSON.stringify(join(out, "browser", "index.js"))};
             console.log(renderPostBody("**x**"));`
        );
        expect(inputs.some((p) => /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?remarkable\//.test(p))).toBe(true);
    }, 60_000);
});

describe("the browser build's entry list", () => {
    // Entry order feeds esbuild's chunk names, and the dist is committed, so an
    // unsorted list (a glob) turns every release into an arbitrary dist diff.
    // Same guard as packages/sdk/test/build-shape.spec.ts.
    it("is every shipped source file, sorted", () => {
        const entries = sourceEntries();
        expect(entries.every((e) => !e.includes("*"))).toBe(true);
        expect([...entries]).toEqual([...entries].sort());
        expect(entries).toContain(join("src", "index.ts"));
    });

    it("leaves out specs, declarations and the test fixtures", () => {
        const entries = sourceEntries();
        expect(entries.filter((e) => /\.(spec|test)\.ts$/.test(e))).toEqual([]);
        expect(entries.filter((e) => e.endsWith(".d.ts"))).toEqual([]);
        expect(entries.filter((e) => e.startsWith(join("src", "test")))).toEqual([]);
    });
});
