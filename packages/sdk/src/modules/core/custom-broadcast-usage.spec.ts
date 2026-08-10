import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `auth.broadcast` is the caller-supplied broadcaster, not "the keychain path".
 *
 * Four mutations read it as though it were the latter: they checked
 * `auth?.broadcast` and threw when it was missing. Every field on `AuthContext`
 * is optional, `broadcast?` included, so an `AuthContextV2` satisfies the type
 * structurally and the check compiled fine everywhere. Each site then failed
 * only when a real user reached it, which is how four accumulated before one
 * surfaced as a Sentry issue.
 *
 * The type system cannot express this, so a scan is what is left. It reads the
 * syntax tree rather than the text, because `auth.broadcast` appears in prose
 * throughout these files and a text search reports the comments explaining why
 * not to use it.
 */

const MODULES = join(__dirname, "..");

/**
 * Where reading `auth.broadcast` is the point rather than a mistake.
 *
 * `use-broadcast-mutation` owns the `custom` branch of the fallback chain, which
 * is the whole feature. Anything else added here is an admission, so it needs a
 * reason next to it.
 */
const SANCTIONED: Record<string, string> = {
  "core/mutations/use-broadcast-mutation.ts":
    "owns case 'custom', the last link of the default fallback chain",
  "core/mutations/broadcast-json.ts":
    "first branch of its own fallback chain, kept so V1 callers still work",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(path) && !/\.spec\.ts$/.test(path) ? [path] : [];
  });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function isAuthExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return ts.isIdentifier(unwrapped) && /^auth$/i.test(unwrapped.text);
}

function isBroadcastBinding(element: ts.BindingElement): boolean {
  const name = element.propertyName ?? element.name;
  return (
    (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) &&
    name.text === "broadcast"
  );
}

/** True when the source reads `.broadcast` off something named like an auth ctx. */
function sourceReadsAuthBroadcast(source: string, file = "<source>"): boolean {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let found = false;
  const visit = (node: ts.Node): void => {
    const propertyAccess =
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "broadcast" &&
      isAuthExpression(node.expression);
    const elementAccess =
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "broadcast" &&
      isAuthExpression(node.expression);
    const destructuring =
      ts.isVariableDeclaration(node) &&
      Boolean(node.initializer && isAuthExpression(node.initializer)) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.some(isBroadcastBinding);

    if (propertyAccess || elementAccess || destructuring) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function readsAuthBroadcast(file: string): boolean {
  return sourceReadsAuthBroadcast(readFileSync(file, "utf8"), file);
}

describe("auth.broadcast is only read where it is the feature", () => {
  const files = sourceFiles(MODULES);

  it("finds the modules to scan", () => {
    // Guards the reader: an empty list would make the sweep vacuous.
    expect(files).toContain(
      join(MODULES, "core/mutations/use-broadcast-mutation.ts"),
    );
    expect(files).toContain(join(MODULES, "core/mutations/broadcast-json.ts"));
  });

  it("is read only in sanctioned places", () => {
    const offenders = files
      .filter(readsAuthBroadcast)
      .map((f) => f.slice(MODULES.length + 1).split("\\").join("/"))
      .filter((rel) => !(rel in SANCTIONED));

    expect(offenders).toEqual([]);
  });

  /**
   * The detector has to detect. A scan that silently matches nothing passes
   * exactly as well as one that works, which is the failure mode this whole
   * class of test invites.
   */
  it("would catch a new reader, and ignores prose", () => {
    const sanctioned = join(MODULES, "core/mutations/use-broadcast-mutation.ts");
    expect(readsAuthBroadcast(sanctioned)).toBe(true);

    // A file that only MENTIONS it in a comment must not register.
    const proseOnly = join(MODULES, "core/types/auth.ts");
    expect(readsAuthBroadcast(proseOnly)).toBe(false);
  });

  it.each([
    ["dot access", "auth.broadcast"],
    ["optional access", "auth?.broadcast"],
    ["non-null access", "auth!.broadcast"],
    ["string element access", 'auth["broadcast"]'],
    ["parenthesized assertion", "(auth as AuthContext).broadcast"],
    ["angle-bracket assertion", "(<AuthContext>auth).broadcast"],
    ["destructuring", "const { broadcast } = auth"],
    ["renamed destructuring", "const { broadcast: customBroadcast } = auth"],
  ])("detects %s", (_label, source) => {
    expect(sourceReadsAuthBroadcast(source)).toBe(true);
  });
});
