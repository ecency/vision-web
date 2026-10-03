// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../../../", import.meta.url));
const source = (path: string) => readFileSync(`${webRoot}${path}`, "utf8");

/**
 * Surfaces that turn a post into a cover or into HTML. Each one can run
 * without the others (a route handler never loads the root layout, a feed
 * query never renders the entry page), so each calls the enabler itself.
 */
const CALLERS = [
  "src/core/sdk-init.ts",
  "src/core/entries/slim-entry.ts",
  "src/core/entries/catch-post-image-safely.ts",
  "src/app/(dynamicPages)/entry/_helpers/entry-card-fields.ts",
  "src/features/structured-data/index.tsx",
  "src/features/post-renderer/components/ecency-renderer.tsx",
  "src/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-static-body.tsx"
];

describe("BitChute cover origin reaches the production bundle", () => {
  it.each(CALLERS)("%s calls the enabler unconditionally at module scope", (path) => {
    const text = source(path);
    expect(text).toMatch(
      /import\s*\{[^}]*\benableBitchuteThumbnails\b[^}]*\}\s*from\s*"@\/core\/enable-bitchute-thumbnails"/
    );
    expect(text).not.toMatch(/import\s*"@\/core\/enable-bitchute-thumbnails"/);

    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const callsAtTopLevel = file.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        ts.isIdentifier(statement.expression.expression) &&
        statement.expression.expression.text === "enableBitchuteThumbnails" &&
        statement.expression.arguments.length === 0
    );
    expect(callsAtTopLevel).toBe(true);
  });

  it("keeps the module itself free of a module-top call", () => {
    const text = source("src/core/enable-bitchute-thumbnails.ts");
    expect(text).toMatch(/export function enableBitchuteThumbnails\(\)/);
    expect(text).not.toMatch(/^setBitchuteThumbnailOrigin\(/m);
  });
});
