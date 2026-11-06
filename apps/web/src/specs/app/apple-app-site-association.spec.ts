import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/apple-app-site-association/route";

interface AppleAppSiteAssociation {
  applinks: { apps: string[]; details: Array<{ appID: string; paths: string[] }> };
}

describe("apple-app-site-association", () => {
  it("lists the waves paths the app handles, next to the feed and post paths", async (): Promise<void> => {
    const body = (await GET().json()) as AppleAppSiteAssociation;
    const [detail] = body.applinks.details;
    expect(detail.appID).toBe("75B6RXTKGT.app.esteem.mobile.ios");
    expect(detail.paths).toEqual(expect.arrayContaining(["/waves", "/waves/*", "/@*", "/*/@*/*"]));
  });

  it("lists the signup and purchase paths the app routes, keeping the existing ones", async (): Promise<void> => {
    const body = (await GET().json()) as AppleAppSiteAssociation;
    const [detail] = body.applinks.details;
    expect(detail.paths).toEqual([
      "/@*",
      "/*/@*/*",
      "/hot/*",
      "/trending/*",
      "/created/*",
      "/hot",
      "/trending",
      "/created",
      "/waves",
      "/waves/*",
      "/signup",
      "/signup/*",
      "/purchase",
      "/purchase/*"
    ]);
  });

  it("leaves out /auth, the web HiveSigner callback", async (): Promise<void> => {
    const body = (await GET().json()) as AppleAppSiteAssociation;
    const [detail] = body.applinks.details;
    expect(detail.paths.filter((path) => path.startsWith("/auth"))).toEqual([]);
  });

  it("is served under /.well-known, where Apple looks first", (): void => {
    // next.config.js wraps the config in Sentry, PWA and analyzer plugins, so the
    // rewrite is checked in the source rather than by loading the module.
    const config = readFileSync(resolve(__dirname, "../../../next.config.js"), "utf8");
    const rewrite =
      /source:\s*"\/\.well-known\/apple-app-site-association",\s*destination:\s*"\/apple-app-site-association"/;
    expect(config).toMatch(rewrite);
  });
});
