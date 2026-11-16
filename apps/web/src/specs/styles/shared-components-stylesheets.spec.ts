import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

// features/shared stylesheets load once through styles/_shared-components.scss
// (#1632): a component that imports its own sheet emits an extra render-blocking
// <link>. A component moved into features/shared must bring its sheet along there.
const src = resolve(__dirname, "../..");
const shared = join(src, "features/shared");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]
  );
}

describe("features/shared stylesheets", () => {
  const all = files(shared);
  const aggregate = readFileSync(join(src, "styles/_shared-components.scss"), "utf8");

  it("are not imported from components", () => {
    const importing = all
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /^import\s+["'][^"']+\.s?css["']/m.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(importing).toEqual([]);
  });

  it("are all registered in styles/_shared-components.scss", () => {
    const missing = all
      .filter((f) => /\/_[^/]+\.scss$/.test(f))
      .map((f) => "../" + relative(src, f).replace(/\/_([^/]+)\.scss$/, "/$1"))
      .filter((entry) => !aggregate.includes(`@import "${entry}";`));
    expect(missing).toEqual([]);
  });
});
