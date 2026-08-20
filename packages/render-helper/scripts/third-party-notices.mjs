#!/usr/bin/env node
/**
 * Writes THIRD-PARTY-NOTICES.md for the dependencies the build INLINES.
 *
 * The node build bundles remarkable (vision-web#1519), which brings autolinker
 * and tslib with it. Remarkable and autolinker are MIT, and MIT requires the
 * copyright and permission notice to travel with "copies or substantial
 * portions of the Software", so shipping their code inside our bundle without
 * their notices would not satisfy the licence.
 *
 * The list is derived from esbuild's metafile rather than hand-written, so it
 * cannot drift: whatever the bundler actually pulled in is what gets a notice.
 * A hand-written list would already have been wrong, since remarkable also
 * depends on argparse, which is tree-shaken out and must NOT be claimed as
 * bundled.
 *
 * Usage: node scripts/third-party-notices.mjs [outDir=dist]
 * The metafiles are consumed and deleted, so they never reach the tarball.
 */
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(PKG, process.argv[2] ?? "dist");

/** Every metafile tsup emitted, at any depth under the output directory. */
function metafiles(dir) {
    const found = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...metafiles(full));
        else if (/^metafile-.*\.json$/.test(entry.name)) found.push(full);
    }
    return found;
}

/**
 * The package root for a bundled input path. Taken from the path itself rather
 * than by resolving the name, because pnpm's store means the copy that was
 * bundled is the authority on which version it was.
 */
function packageRootOf(input) {
    const match = input.match(/^(.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@[^/]+\/)?[^/]+)\//);
    return match ? resolve(PKG, match[1]) : null;
}

function licenceTextOf(root) {
    const file = readdirSync(root).find((name) => /^licen[cs]e(\.|$)/i.test(name));
    return file && statSync(join(root, file)).isFile() ? readFileSync(join(root, file), "utf8").trim() : null;
}

const roots = new Map();
const files = metafiles(outDir);
if (files.length === 0) {
    console.error(`third-party-notices: no metafile under ${outDir}. Run tsup with --metafile first.`);
    process.exit(1);
}

for (const file of files) {
    for (const input of Object.keys(JSON.parse(readFileSync(file, "utf8")).inputs ?? {})) {
        const root = packageRootOf(input);
        if (root) roots.set(root, true);
    }
    rmSync(file, { force: true });
}

const notices = [...roots.keys()]
    .map((root) => {
        const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        return { name: meta.name, version: meta.version, licence: meta.license ?? "see notice", text: licenceTextOf(root) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

const missing = notices.filter((n) => !n.text);
if (missing.length > 0) {
    console.error(`third-party-notices: no licence file found for ${missing.map((n) => n.name).join(", ")}`);
    process.exit(1);
}

const body = [
    "# Third-party notices",
    "",
    "`@ecency/render-helper` bundles the following packages into its published build output.",
    "Their licences and copyright notices are reproduced here in full, as those licences require.",
    "",
    "This file is generated during the build from the bundler's own metafile, so it lists what was",
    "actually inlined. Do not edit it by hand.",
    "",
    ...notices.flatMap((n) => [`## ${n.name} ${n.version}`, "", `License: ${n.licence}`, "", "```", n.text, "```", ""])
].join("\n");

writeFileSync(join(outDir, "THIRD-PARTY-NOTICES.md"), `${body}\n`);
console.log(`third-party-notices: ${notices.map((n) => `${n.name}@${n.version}`).join(", ")}`);
