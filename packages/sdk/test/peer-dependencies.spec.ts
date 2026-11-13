import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `@tanstack/react-query` and `react` stay OPTIONAL peers, on purpose (#2069).
 *
 * `@ecency/sdk/hive` exists so Node bots, scripts and other non-React consumers
 * can use the SDK without React. npm 7+ and pnpm auto-install required peers,
 * so making these two required would push React into those projects and can
 * fail their install with a peer conflict when they pin another React major.
 *
 * The cost is that `@ecency/sdk` and `@ecency/sdk/wallets` import React Query at
 * load and need both packages installed alongside; the READMEs say so. That
 * `./hive` really loads without them is proven in `test/build-shape.spec.ts`.
 */

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8")) as {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

describe("React peers of @ecency/sdk", () => {
  for (const name of ["@tanstack/react-query", "react"]) {
    it(`declares ${name} as an optional peer`, () => {
      expect(pkg.peerDependencies?.[name]).toBeTruthy();
      expect(pkg.peerDependenciesMeta?.[name]?.optional).toBe(true);
    });
  }
});
