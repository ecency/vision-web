import { describe, expect, it } from "vitest";
import { GET } from "@/app/apple-app-site-association/route";

describe("apple-app-site-association", () => {
  it("lists the waves paths the app handles, next to the feed and post paths", async () => {
    const body = await GET().json();
    const paths: string[] = body.applinks.details[0].paths;
    expect(body.applinks.details[0].appID).toBe("75B6RXTKGT.app.esteem.mobile.ios");
    expect(paths).toEqual(expect.arrayContaining(["/waves", "/waves/*", "/@*", "/*/@*/*"]));
  });
});
