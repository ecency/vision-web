import { readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { defineConfig, type Options } from "tsup";

type Plugin = NonNullable<Options["esbuildPlugins"]>[number];

/**
 * Every buildable source file, in a STABLE order.
 *
 * The browser build below takes an entry per file, and the obvious spelling,
 * `entry: ["src/**\/*.ts", ...]`, leaves that list in glob order, which is not
 * stable across runs. Measured: two consecutive builds of identical sources
 * disagreed on 67 chunk NAMES and 335 files by content, because entry order
 * feeds esbuild's chunk composition and its content hashes. `dist` is committed,
 * so that turned every release into an arbitrary ~1,100-file diff.
 *
 * Sorting removes that churn, so a release diff carries close to only the files
 * that actually changed. It does NOT make the build byte-reproducible: esbuild's
 * own emission still varies in 0 to 23 files of 1,110 between runs, and a chunk
 * name follows its content hash, so an occasional name moves too (seen once on a
 * CI runner). `test/build-shape.spec.ts` therefore asserts THIS ORDERING, which
 * is ours to control, instead of diffing two builds, which is not.
 */
export function sourceEntries(dir = "src"): string[] {
    const walk = (from: string): string[] => {
        const found: string[] = [];
        for (const entry of readdirSync(from, { withFileTypes: true })) {
            const path = join(from, entry.name);
            if (entry.isDirectory()) {
                found.push(...walk(path));
            } else if (/\.ts$/.test(entry.name) && !/\.(spec|test|d)\.ts$/.test(entry.name)) {
                found.push(path);
            }
        }
        return found;
    };
    // Sorted once over the whole list, not per directory. A depth-first walk with
    // each directory sorted is still deterministic, but it interleaves by nesting
    // ("modules/core/queries/..." lands before "modules/core/queries-manager.ts"),
    // which is not an order anyone can predict or assert against. One flat sort is
    // both stable and obvious. Plain comparison, never localeCompare, so the order
    // cannot depend on the builder's locale.
    return walk(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Where the two builds are written. `dist` in normal use; the build-shape guard
 * in `test/build-shape.spec.ts` points it at a throwaway directory so it can
 * assert the emitted SHAPE of both builds without touching the committed
 * `dist`, which the auto-changeset bot owns and which is legitimately stale on
 * any branch that edits this file.
 *
 * It has to be a root rather than a per-build override: `tsup --out-dir` would
 * apply to BOTH configs in this array, pointing them at one directory, and the
 * browser config below sets `clean: true`. Keeping a subdirectory each is what
 * the normal build already does, so the guard exercises the real layout.
 */
const DIST_ROOT = process.env.SDK_DIST_ROOT ?? "dist";

/** The public entry points, in the order `package.json` lists them. */
const PUBLIC_ENTRIES = ["src/index.ts", "src/hive.ts", "src/wallets.ts"];

/**
 * Node build only: `src/wallets/**` loads the rest of the SDK from the sibling
 * `index` bundle instead of inlining its own copy.
 *
 * The node build is a single bundle per entry (see below), so without this
 * `wallets.mjs` would carry a second `ConfigManager`, QueryClient and hive-tx
 * config, and SSR would run wallet queries against a copy nobody configured.
 * The standalone `@ecency/wallets` package got the shared copy for free by
 * importing `@ecency/sdk` as an external; this keeps that.
 *
 * Wallet modules therefore reach the SDK only through `src/index.ts`. A
 * relative import from `src/wallets` to anywhere else outside it fails the
 * build rather than silently inlining a module with state.
 */
function walletsShareMainEntry(): Plugin {
    const index = resolve("src/index");
    const wallets = resolve("src/wallets") + sep;
    return {
        name: "wallets-share-main-entry",
        setup(build) {
            // From the output extension, not `format`: with `treeshake` tsup runs
            // esbuild in ESM for both formats and converts to CJS afterwards.
            const ext = build.initialOptions.outExtension?.[".js"] === ".cjs" ? ".cjs" : ".mjs";
            build.onResolve({ filter: /^\.\.?\// }, (args) => {
                if (!args.importer.startsWith(wallets)) return undefined;
                const target = resolve(args.resolveDir, args.path).replace(/\.ts$/, "");
                if (target === index) return { path: `./index${ext}`, external: true };
                if (target.startsWith(wallets)) return undefined;
                return {
                    errors: [
                        {
                            text: `${args.importer} imports ${args.path}, outside src/wallets. Import it from the SDK entry (src/index.ts) instead, so the node build shares the main bundle's state.`,
                        },
                    ],
                };
            });
        },
    };
}

const shared = {
    entry: PUBLIC_ENTRIES,
    splitting: false,
    sourcemap: true,
    treeshake: true,
    external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@tanstack/react-query",
        "@noble/ciphers",
        "@noble/curves",
        "@noble/hashes",
        "@noble/hashes/sha2.js",
        "bs58",
        "hivesigner",
        "lru-cache",
        "scheduler",
        "bip39",
        "@scure/base",
        "@scure/bip32",
        "@scure/bip39",
        "remeda",
        "@solana/web3.js",
        "@wallet-standard/app",
        "node-fetch",
        "undici",
        "crypto"
    ],
    shims: false,
};

export default defineConfig([
    // Browser build
    {
        ...shared,
        // An entry per source file, not one bundle.
        //
        // A single pre-bundled file is opaque to the consumer's bundler: webpack
        // sees ONE module, so it can neither split it nor drop what a route never
        // imports, and every page that touched any SDK export paid for all of it.
        // Measured on vision-web (#1804): the route chunk holding this file was
        // 270 KB parsed for exactly one module, of which 237 KB never executed on
        // a community feed.
        //
        // With an entry per file plus `splitting`, esbuild hoists shared code into
        // chunks and `index.js` becomes a set of re-exports. `sideEffects: false`
        // is already declared, so a downstream bundler can then drop what a route
        // does not reach. Measured across 165 vision-web routes: mean First Load
        // JS 393 KB -> 370 KB, /chats 488 -> 390, the community feed 624 -> 597,
        // the entry page 781 -> 772.
        //
        // Module-group granularity (`src/modules/*/index.ts`) was tried first and
        // recovered less than half of that (mean 382 KB), because a group barrel
        // is retained whole as soon as one export in it is used.
        //
        // The cost is file count: dist/browser goes from 4 JS files to ~1100, and
        // the committed dist churns by that much per release. Consumers still pull
        // only the files they import.
        //
        // ⛔ The node build below MUST stay a single bundle, and not only because
        // plain Node loads it with no bundler in front of it.
        //
        // `splitting` also unifies module state across entry points. Today
        // `dist/node/index.*` and `dist/node/hive.*` are separate bundles, so each
        // carries its OWN copy of hive-tx's mutable config (nodes, User-Agent,
        // resilience, server RPC proxy). `apps/web` relies on that isolation:
        // `app/api/internal/seo/sitemap-generate/route.ts` calls `setNodes` and
        // `setUserAgent` through `@ecency/sdk/hive` to point ONE route at the
        // curated public-node list, while the rest of SSR keeps what
        // `core/sdk-init.ts` set through `ConfigManager`. Split the node build and
        // that route's settings become process-global for every concurrent render
        // in the same replica.
        //
        // The browser build shares one copy after this change, which is the right
        // behaviour for a single-user process. Verified inert for current
        // consumers: `apps/web` never imports `@ecency/sdk/hive` on the client,
        // and `apps/self-hosted`, which imports both entries, never configures
        // hive-tx in the browser.
        entry: sourceEntries(),
        splitting: true,
        dts: { entry: PUBLIC_ENTRIES },
        format: ["esm"],
        platform: "browser",
        target: "es2020",
        outDir: `${DIST_ROOT}/browser`,
        clean: true,
        minify: true,
        outExtension() {
            return { js: ".js" };
        },
        define: {
            "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
            "process.env.VITE_HELIUS_API_KEY": JSON.stringify(process.env.VITE_HELIUS_API_KEY ?? ""),
        },
    },
    // Node build (SSR, scripts, CLI)
    {
        ...shared,
        dts: false,
        esbuildPlugins: [walletsShareMainEntry()],
        format: ["esm", "cjs"],
        platform: "node",
        target: "node18",
        outDir: `${DIST_ROOT}/node`,
        clean: false,
        minify: true,
        outExtension({ format }) {
            return { js: format === "esm" ? ".mjs" : ".cjs" };
        },
    },
]);
