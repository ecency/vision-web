import { defineConfig } from "tsup";

/**
 * Where the two builds are written. `dist` in normal use; the plain-node guard
 * in `test/dist-loads-in-plain-node.spec.ts` points it at a throwaway
 * directory so it can build without touching the committed `dist`. Same
 * variable shape as `SDK_DIST_ROOT` in packages/sdk, which solves the same
 * problem, so there is one convention rather than two.
 *
 * It has to be a root rather than `tsup --out-dir`: that flag applies to BOTH
 * configs in this array, so it points them at one directory. Both emit an esm
 * bundle, and tsup writes a metafile named after the format into the output
 * directory, so the two builds then write `metafile-esm.json` to one path.
 * tsup runs the configs concurrently (one process, `Promise.all`), so one
 * build's file simply loses, and when the writes overlap the file holds one
 * document followed by the tail of the other. `third-party-notices.mjs` then
 * dies parsing it, which is what took a staging deploy down in #1863.
 */
const DIST_ROOT = process.env.RENDER_HELPER_DIST_ROOT ?? "dist";

/** The flag that would undo all of the above, in every spelling cac accepts. */
const pointsBothBuildsAtOneDirectory = (arg: string) =>
    arg === "--out-dir" || arg === "-d" || arg.startsWith("--out-dir=") || arg.startsWith("-d=");

if (process.argv.some(pointsBothBuildsAtOneDirectory)) {
    // Fail loudly rather than race: a collision that only shows up on a loaded
    // CI runner is the worst way to find this out.
    throw new Error(
        "render-helper: build somewhere else with RENDER_HELPER_DIST_ROOT, not --out-dir. " +
            "One --out-dir points BOTH builds at one directory, where they overwrite each other's metafile (#1863)."
    );
}

const shared = {
    entry: ["src/index.ts"],
    splitting: false,
    sourcemap: true,
    treeshake: true,
    external: [
        "entities",
        "htmlparser2",
        "dom-serializer",
        "@xmldom/xmldom",
        "lolight",
        "lru-cache",
        "multihashes",
        "path",
        "querystring",
        "react-native-crypto-js",
        "remarkable",
        "url",
        "xmldom",
        "xss"
    ] as const,
    shims: false,
} as const;

export default defineConfig([
    // Browser build
    {
        ...shared,
        dts: {
            resolve: true,
        },
        format: ["esm"],
        platform: "browser",
        target: "es2020",
        outDir: `${DIST_ROOT}/browser`,
        // The build script clears dist before running tsup. Cleaning from
        // inside one of two configs only ever cleaned that config's own
        // directory, left dist/node to accumulate stale files, and raced with
        // the other build the moment both are pointed at a single directory.
        clean: false,
        minify: false,
        outExtension: () => ({ js: ".js" }),
        define: {
            "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
        },
    },
    // Node build
    {
        ...shared,
        // remarkable is bundled INTO the node build, and only this build.
        //
        // Its `linkify` entry is a legacy module directory: a folder holding
        // nothing but a package.json with main/module. CJS resolves that stub,
        // ESM does not, so `import "remarkable/linkify"` in the emitted .mjs
        // made the package unloadable by plain Node with
        // ERR_UNSUPPORTED_DIR_IMPORT (vision-web#1519). Every bundler resolves
        // the directory happily, which is why nothing caught it: the failure
        // only appears where there is no bundler, such as the newsletter
        // service.
        //
        // Inlining it rather than pointing at a file inside remarkable, because
        // remarkable/dist/esm/linkify.js is a .js in a package with no
        // "type": "module", so it is nominally CommonJS and only loads on
        // Node >= 22.7 through module-syntax detection, and the .cjs file costs
        // every browser bundle autolinker's CommonJS build instead of its
        // tree-shakeable one. `noExternal` wins over the shared `external`
        // list, which is left alone so the browser build is untouched: it stays
        // byte for byte what it is today, which is what React Native loads.
        noExternal: ["remarkable"],
        dts: false,
        format: ["esm", "cjs"],
        platform: "node",
        target: "node18",
        outDir: `${DIST_ROOT}/node`,
        clean: false,
        minify: false,
        outExtension: ({ format }) => ({ js: format === "esm" ? ".mjs" : ".cjs" }),
    },
]);
