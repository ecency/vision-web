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

// Any static import or re-export of memo-crypto: named, multiline, bare
// (side-effect) or `export ... from`. A dynamic `import("...")` is not one.
const TARGET = String.raw`(?:@\/utils\/memo-crypto|\.\.?\/(?:[^"']*\/)?memo-crypto)`;
const STATIC_FORMS = [
  new RegExp(String.raw`(?:^|[;\n])\s*(?:import|export)\b[^;"'()]*?\bfrom\s*["']${TARGET}["']`, "m"),
  new RegExp(String.raw`(?:^|[;\n])\s*import\s*["']${TARGET}["']`, "m")
];
function importsStatically(code: string): boolean {
  return STATIC_FORMS.some((re) => re.test(code));
}

describe("memo-crypto", () => {
  it("is never imported statically, only loaded on demand", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join("utils", "memo-crypto.ts")))
      .filter((file) => importsStatically(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("recognises every static form, so the guard cannot be slipped past", () => {
    for (const code of [
      'import { decryptMemo } from "@/utils/memo-crypto";',
      "import {\n  encryptMemo,\n  decryptMemo\n} from '@/utils/memo-crypto'",
      'import "@/utils/memo-crypto";',
      'export * from "./memo-crypto";',
      'export { encryptMemo } from "../utils/memo-crypto"'
    ]) {
      expect(importsStatically(code), code).toBe(true);
    }
    expect(importsStatically('const { decryptMemo } = await import("@/utils/memo-crypto");')).toBe(false);
  });

  it("is still loaded by both callers", () => {
    for (const file of ["features/shared/memo-display.tsx", "api/mutations/sign-transfer.ts"]) {
      expect(readFileSync(join(SRC, file), "utf8")).toMatch(/await import\("@\/utils\/memo-crypto"\)/);
    }
  });
});
