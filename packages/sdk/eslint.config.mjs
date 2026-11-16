import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `scripts` holds CommonJS build/validation scripts (.cjs) that legitimately use
    // require(); linting them with the TS recommended rules is a false positive.
    ignores: ["dist", "node_modules", "tsup.config.ts", "scripts"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unnecessary-type-constraint": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-var": "off",
      "prefer-const": "off",
    },
  },
  {
    // String.prototype.matchAll is ES2020 and throws on Safari 12 (#1701).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "matchAll", message: "matchAll throws on Safari 12 (#1701). Use the local regexMatches helper or RegExp.exec." }
      ]
    }
  }
);
