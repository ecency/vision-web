import { defineConfig } from "tsup";

// The shim re-exports `@ecency/sdk/wallets` and nothing else, so `@ecency/sdk`
// stays external and each build is one re-export line. It emits the same
// `dist/browser` and `dist/node` files the package's `exports` map has always
// pointed at, so every condition of the `.` export keeps resolving.
const shared = {
    entry: ["src/index.ts"],
    splitting: false,
    sourcemap: true,
    treeshake: true,
    external: ["@ecency/sdk", "@ecency/sdk/wallets"],
    shims: false,
} as const;

export default defineConfig([
    // Browser build
    {
        ...shared,
        dts: true,
        format: ["esm"],
        platform: "browser",
        target: "es2020",
        outDir: "dist/browser",
        clean: true,
        minify: false,
        outExtension: () => ({ js: ".js" }),
    },
    // Node build
    {
        ...shared,
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
