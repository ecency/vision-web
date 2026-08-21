import { defineConfig } from "tsup";

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
        outDir: "dist/browser",
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
        outDir: "dist/node",
        clean: false,
        minify: false,
        outExtension: ({ format }) => ({ js: format === "esm" ? ".mjs" : ".cjs" }),
    },
]);
