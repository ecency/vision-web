import tseslint from "typescript-eslint";
import regexp from "eslint-plugin-regexp";

// Lint config for @ecency/render-helper.
//
// The package processes untrusted user-authored markdown on the SSR hot
// path. A single catastrophic-backtracking regex is enough to pin the
// Node main thread for tens of seconds — that's exactly what happened in
// #782 with `removeDuplicateAttributes`. The regexp rules below analyse
// every static regex literal in the package and reject patterns that can
// blow up under adversarial input, so the next ReDoS gets caught at PR
// time instead of in production.
//
// We intentionally do NOT enable `regexp/flat/recommended` — its other
// rules (e.g. `prefer-w`, `no-unused-capturing-group`) would expand this
// PR into a sweep of pre-existing cosmetic findings. We also keep
// parsing non-type-aware: the rules below don't need type info, and
// turning on `projectService` would require adding every `.spec.ts` to
// the project — out of scope for this change.
export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "tsup.config.ts"]
  },
  {
    // Existing files in this package have inline `eslint-disable-next-line
    // @typescript-eslint/no-explicit-any` directives (a rule we don't enable
    // here). With `reportUnusedDisableDirectives` on, ESLint would warn on
    // each of them and force unrelated churn. Turn it off so this PR stays
    // focused on adding the regexp rules.
    linterOptions: {
      reportUnusedDisableDirectives: false
    }
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { regexp, "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser
    },
    rules: {
      // Define (off) so existing inline `eslint-disable-next-line
      // @typescript-eslint/no-explicit-any` comments resolve to a known
      // rule. Full @typescript-eslint enforcement is out of scope here.
      "@typescript-eslint/no-explicit-any": "off",
      "regexp/no-super-linear-backtracking": "error",
      "regexp/no-super-linear-move": "error"
    }
  },
  {
    // Specs intentionally include adversarial regex shapes as test
    // fixtures; don't gate test code on these rules.
    files: ["src/**/*.spec.{ts,tsx}"],
    rules: {
      "regexp/no-super-linear-backtracking": "off",
      "regexp/no-super-linear-move": "off"
    }
  },
  {
    // String.prototype.matchAll is ES2020 and throws on Safari 12 (#1701).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "matchAll", message: "matchAll throws on Safari 12 (#1701). Use regexMatches from ./regex-matches or RegExp.exec." }
      ]
    }
  }
);
