import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// #1434: memo-crypto pulls the SDK's `Memo`, and with it the AES code from
// @noble/ciphers, into every page that can show or send a memo (post and
// profile pages among them), although a memo is only encrypted or decrypted
// on demand. Its callers load it when they need it instead.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "specs" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("memo-crypto", () => {
  it("is never imported statically, only loaded on demand", () => {
    // Any quote style, with or without a semicolon, and re-exports too.
    const staticImport = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["'](?:@\/utils\/memo-crypto|\.\.?\/(?:[^"']*\/)?memo-crypto)["']/;
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join("utils", "memo-crypto.ts")))
      .filter((file) => staticImport.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("is still loaded by both callers", () => {
    for (const file of ["features/shared/memo-display.tsx", "api/mutations/sign-transfer.ts"]) {
      expect(readFileSync(join(SRC, file), "utf8")).toMatch(/await import\("@\/utils\/memo-crypto"\)/);
    }
  });
});
